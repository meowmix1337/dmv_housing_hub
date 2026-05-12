// Package zillow ports scripts/ingest/zillow.ts. Downloads four county-scope
// ZHVI/ZORI CSVs plus one metro-scope ZHVI CSV, transposes the wide format
// (one column per month) to long form, and emits one observation per
// (region, month) cell.
package zillow

import (
	"context"
	"encoding/csv"
	"io"
	"log/slog"
	"regexp"
	"strconv"
	"strings"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

const (
	zhviBase      = "https://files.zillowstatic.com/research/public_csvs/zhvi"
	zoriBase      = "https://files.zillowstatic.com/research/public_csvs/zori"
	dcMetroRegion = "Washington, DC"
	dcMetroFIPS   = "47900"
)

type Scope int

const (
	ScopeCounty Scope = iota
	ScopeMetro
)

type FileSpec struct {
	URL    string
	Metric types.MetricId
	Unit   types.Unit
	Scope  Scope
}

func DefaultFiles() []FileSpec {
	return []FileSpec{
		{URL: zhviBase + "/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv", Metric: types.MetricZhviAllHomes, Unit: types.UnitUSD, Scope: ScopeCounty},
		{URL: zhviBase + "/County_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv", Metric: types.MetricZhviSFH, Unit: types.UnitUSD, Scope: ScopeCounty},
		{URL: zhviBase + "/County_zhvi_uc_condo_tier_0.33_0.67_sm_sa_month.csv", Metric: types.MetricZhviCondo, Unit: types.UnitUSD, Scope: ScopeCounty},
		{URL: zoriBase + "/County_zori_uc_sfrcondomfr_sm_sa_month.csv", Metric: types.MetricZoriRent, Unit: types.UnitUSD, Scope: ScopeCounty},
		{URL: zhviBase + "/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv", Metric: types.MetricZhviAllHomes, Unit: types.UnitUSD, Scope: ScopeMetro},
	}
}

var dmvStateNames = map[string]struct{}{"DC": {}, "MD": {}, "VA": {}}
var dateColRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// BuildFipsIndex builds a lowercase region-name → FIPS lookup with the
// same aliases the TS index uses: name, name with " city"/" (city)" suffix
// stripped, and an apostrophe-stripped variant.
func BuildFipsIndex() map[string]string {
	m := make(map[string]string, len(counties.All())*3)
	for _, c := range counties.All() {
		key := strings.ToLower(c.Name)
		m[key] = c.FIPS
		if strings.HasSuffix(key, " city") {
			m[strings.TrimSpace(strings.TrimSuffix(key, " city"))] = c.FIPS
		}
		if strings.HasSuffix(key, " (city)") {
			m[strings.TrimSpace(strings.TrimSuffix(key, " (city)"))] = c.FIPS
		}
		if stripped := strings.ReplaceAll(key, "'", ""); stripped != key {
			m[stripped] = c.FIPS
		}
	}
	return m
}

type Source struct {
	client *httpclient.Client
	logger *slog.Logger
	files  []FileSpec
}

func New(client *httpclient.Client) *Source {
	return &Source{
		client: client,
		logger: pkglog.Default(),
		files:  DefaultFiles(),
	}
}

// SetFiles overrides the file list (tests).
func (s *Source) SetFiles(files []FileSpec) { s.files = files }

func (s *Source) Name() string           { return "zillow" }
func (s *Source) Cadence() types.Cadence { return types.CadenceMonthly }

// SetLogger overrides the package-default logger. Used by cmd/ingest-all
// to inject a per-source attribute on every record.
func (s *Source) SetLogger(l *slog.Logger) {
	if l != nil {
		s.logger = l
	}
}

func (s *Source) Fetch(ctx context.Context) ([]types.Observation, error) {
	fipsIndex := BuildFipsIndex()
	var all []types.Observation
	for _, spec := range s.files {
		s.logger.Info("zillow: fetching", "url", spec.URL, "metric", spec.Metric, "scope", scopeName(spec.Scope))
		body, err := s.client.GetText(ctx, spec.URL, "zillow:"+string(spec.Metric)+":"+scopeName(spec.Scope))
		if err != nil {
			s.logger.Error("zillow: fetch failed; skipping file", "url", spec.URL, "err", err)
			continue
		}
		obs, err := ParseCSV(body, spec, fipsIndex, s.logger)
		if err != nil {
			s.logger.Error("zillow: parse failed; skipping file", "url", spec.URL, "err", err)
			continue
		}
		all = append(all, obs...)
		s.logger.Info("zillow: file done", "metric", spec.Metric, "scope", scopeName(spec.Scope), "count", len(obs))
	}
	if len(all) == 0 {
		s.logger.Warn("zillow: zero observations after processing all files")
	} else {
		s.logger.Info("zillow: done", "count", len(all))
	}
	return all, nil
}

// ParseCSV decodes a Zillow wide-format CSV into long-form Observations.
// Exported for unit testing without HTTP.
func ParseCSV(body string, spec FileSpec, fipsIndex map[string]string, logger *slog.Logger) ([]types.Observation, error) {
	if logger == nil {
		logger = pkglog.Default()
	}
	r := csv.NewReader(strings.NewReader(body))
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if err != nil {
		return nil, err
	}
	idx := make(map[string]int, len(header))
	for i, h := range header {
		idx[h] = i
	}

	// Pre-compute date columns and their string keys (Observation.ObservedAt uses these as-is).
	type dateCol struct {
		col  int
		date string
	}
	dateCols := make([]dateCol, 0, len(header))
	for i, h := range header {
		if dateColRe.MatchString(h) {
			dateCols = append(dateCols, dateCol{col: i, date: h})
		}
	}

	regionNameCol, hasRegionName := idx["RegionName"]
	stateNameCol, hasStateName := idx["StateName"]

	var out []types.Observation
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		var fips, series string
		if spec.Scope == ScopeMetro {
			if !hasRegionName || regionNameCol >= len(rec) {
				continue
			}
			if rec[regionNameCol] != dcMetroRegion {
				continue
			}
			fips = dcMetroFIPS
			series = "zillow:metro:" + string(spec.Metric)
		} else {
			if !hasStateName || stateNameCol >= len(rec) {
				continue
			}
			st := rec[stateNameCol]
			if _, ok := dmvStateNames[st]; !ok {
				continue
			}
			if !hasRegionName || regionNameCol >= len(rec) {
				continue
			}
			regionLower := strings.ToLower(rec[regionNameCol])
			f, ok := fipsIndex[regionLower]
			if !ok {
				logger.Debug("zillow: county not in DMV; skipping", "region", rec[regionNameCol], "state", st)
				continue
			}
			fips = f
			series = "zillow:county:" + string(spec.Metric)
		}

		for _, dc := range dateCols {
			if dc.col >= len(rec) {
				continue
			}
			raw := strings.TrimSpace(rec[dc.col])
			if raw == "" {
				continue
			}
			val, err := strconv.ParseFloat(raw, 64)
			if err != nil {
				continue
			}
			out = append(out, types.Observation{
				Source:     "zillow",
				Series:     series,
				FIPS:       fips,
				Metric:     spec.Metric,
				ObservedAt: dc.date,
				Value:      val,
				Unit:       spec.Unit,
			})
		}
	}
	return out, nil
}

func scopeName(s Scope) string {
	if s == ScopeMetro {
		return "metro"
	}
	return "county"
}
