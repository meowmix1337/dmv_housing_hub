// Package census ports scripts/ingest/census.ts. It fetches three Census ACS
// 5-year estimates (median household income, median home value, median gross
// rent) for DMV counties, pairing each estimate with its margin-of-error.
//
// API doc: https://www.census.gov/data/developers/data-sets/acs-5year.html
package census

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

const (
	acsYear    = 2024
	observedAt = "2024-01-01"
	sentinel   = "-666666666"
	baseURL    = "https://api.census.gov/data/2024/acs/acs5"
)

type Config struct {
	APIKey string `env:"CENSUS_API_KEY,required"`
}

type variableSpec struct {
	variable string
	metric   types.MetricId
	unit     types.Unit
}

var variables = []variableSpec{
	{variable: "B19013_001E", metric: types.MetricMedianHouseholdInc, unit: types.UnitUSD},
	{variable: "B25077_001E", metric: types.MetricMedianHomeValue, unit: types.UnitUSD},
	{variable: "B25064_001E", metric: types.MetricMedianGrossRent, unit: types.UnitUSD},
}

// stateGroup is one outbound Census API call: one state, plus a county filter.
type stateGroup struct {
	stateFIPS   string
	countyParam string // "*" for all counties, or a specific county FIPS
}

var stateGroups = []stateGroup{
	{stateFIPS: "11", countyParam: "001"},
	{stateFIPS: "24", countyParam: "*"},
	{stateFIPS: "51", countyParam: "*"},
}

func moeVariableFor(estimate string) string {
	return strings.TrimSuffix(estimate, "E") + "M"
}

type Source struct {
	cfg     Config
	client  *httpclient.Client
	logger  *slog.Logger
	baseURL string // override for tests
}

func New(cfg Config, client *httpclient.Client) *Source {
	return &Source{
		cfg:     cfg,
		client:  client,
		logger:  pkglog.Default(),
		baseURL: baseURL,
	}
}

func (s *Source) Name() string           { return "census" }
func (s *Source) Cadence() types.Cadence { return types.CadenceAnnual }

func (s *Source) Fetch(ctx context.Context) ([]types.Observation, error) {
	dmvFips := dmvFipsSet()

	var out []types.Observation
	for _, g := range stateGroups {
		s.logger.Info("census: fetching state group", "stateFips", g.stateFIPS)
		raw, err := s.fetchStateGroup(ctx, g)
		if err != nil {
			s.logger.Error("census: state group failed; continuing", "stateFips", g.stateFIPS, "err", err)
			continue
		}
		obs, err := ParseRows(raw, dmvFips, s.logger)
		if err != nil {
			s.logger.Error("census: parse failed; continuing", "stateFips", g.stateFIPS, "err", err)
			continue
		}
		out = append(out, obs...)
		s.logger.Info("census: state group done", "stateFips", g.stateFIPS, "count", len(obs))
	}
	return out, nil
}

func (s *Source) fetchStateGroup(ctx context.Context, g stateGroup) ([][]string, error) {
	getVars := make([]string, 0, 1+2*len(variables))
	getVars = append(getVars, "NAME")
	for _, v := range variables {
		getVars = append(getVars, v.variable, moeVariableFor(v.variable))
	}

	q := url.Values{}
	q.Set("get", strings.Join(getVars, ","))
	q.Set("for", "county:"+g.countyParam)
	q.Set("in", "state:"+g.stateFIPS)
	q.Set("key", s.cfg.APIKey)
	u := s.baseURL + "?" + q.Encode()

	var raw [][]string
	if err := s.client.GetJSON(ctx, u, "census:state:"+g.stateFIPS, &raw); err != nil {
		return nil, fmt.Errorf("fetch census state %s: %w", g.stateFIPS, err)
	}
	return raw, nil
}

// ParseRows decodes a Census ACS 2-D array response into Observations.
// Exported so tests can exercise it without HTTP.
func ParseRows(rows [][]string, dmvFips map[string]struct{}, logger *slog.Logger) ([]types.Observation, error) {
	if logger == nil {
		logger = pkglog.Default()
	}
	if len(rows) < 2 {
		return nil, nil
	}

	header := rows[0]
	colIndex := make(map[string]int, len(header))
	for i, h := range header {
		colIndex[h] = i
	}

	stateCol, okState := colIndex["state"]
	countyCol, okCounty := colIndex["county"]
	if !okState || !okCounty {
		return nil, fmt.Errorf("census response missing state/county columns")
	}

	type colSpec struct {
		spec   variableSpec
		col    int
		moeCol int
		hasMOE bool
	}

	cols := make([]colSpec, 0, len(variables))
	minRequired := stateCol
	if countyCol > minRequired {
		minRequired = countyCol
	}
	for _, v := range variables {
		col, ok := colIndex[v.variable]
		if !ok {
			logger.Warn("census: variable column absent", "variable", v.variable)
			continue
		}
		moeCol, hasMOE := colIndex[moeVariableFor(v.variable)]
		cs := colSpec{spec: v, col: col, moeCol: moeCol, hasMOE: hasMOE}
		cols = append(cols, cs)
		if col > minRequired {
			minRequired = col
		}
		if hasMOE && moeCol > minRequired {
			minRequired = moeCol
		}
	}
	minRequired++ // length, not index

	out := make([]types.Observation, 0, len(rows)*len(cols))

	for i := 1; i < len(rows); i++ {
		row := rows[i]
		if len(row) < minRequired {
			logger.Warn("census: row too short; skipping", "rowIndex", i, "rowLength", len(row))
			continue
		}
		stateFips := row[stateCol]
		countyFips := row[countyCol]
		if stateFips == "" || countyFips == "" {
			continue
		}
		fips := padLeft(stateFips, 2) + padLeft(countyFips, 3)
		if _, in := dmvFips[fips]; !in {
			continue
		}

		for _, c := range cols {
			cell := row[c.col]
			if cell == "" || cell == sentinel {
				logger.Warn("census: missing value; skipping observation", "fips", fips, "variable", c.spec.variable)
				continue
			}
			val, err := strconv.ParseFloat(cell, 64)
			if err != nil {
				logger.Warn("census: non-numeric value; skipping", "fips", fips, "variable", c.spec.variable, "cell", cell)
				continue
			}

			obs := types.Observation{
				Source:     "census",
				Series:     c.spec.variable,
				FIPS:       fips,
				Metric:     c.spec.metric,
				ObservedAt: observedAt,
				Value:      val,
				Unit:       c.spec.unit,
			}
			if c.hasMOE {
				moeCell := row[c.moeCol]
				if moeCell != "" && moeCell != sentinel {
					if moe, err := strconv.ParseFloat(moeCell, 64); err == nil && moe >= 0 {
						obs.MOE = &moe
					}
				}
			}
			out = append(out, obs)
		}
	}
	return out, nil
}

func dmvFipsSet() map[string]struct{} {
	cs := counties.All()
	set := make(map[string]struct{}, len(cs))
	for _, c := range cs {
		set[c.FIPS] = struct{}{}
	}
	return set
}

func padLeft(s string, n int) string {
	if len(s) >= n {
		return s
	}
	return strings.Repeat("0", n-len(s)) + s
}
