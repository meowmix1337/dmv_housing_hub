// Package fred ports scripts/ingest/fred.ts. It fetches FRED series at three
// scopes (national, state, county) with a 600 ms inter-call sleep on county
// series to stay under FRED's 120 req/min limit. Per-series failures are
// logged and skipped, never fatal — matches TS behavior.
package fred

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"time"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

const (
	baseURL          = "https://api.stlouisfed.org/fred"
	countySleepDelay = 600 * time.Millisecond
)

type Config struct {
	APIKey string `env:"FRED_API_KEY,required"`
}

type scope int

const (
	scopeNational scope = iota
	scopeState
	scopeCounty
)

type seriesSpec struct {
	idLit  string                 // for national + state scopes
	idFn   func(fips string) string // for county scope
	metric types.MetricId
	unit   types.Unit
	scope  scope
}

var series = []seriesSpec{
	// National
	{idLit: "MORTGAGE30US", metric: types.MetricMortgage30yRate, unit: types.UnitPercent, scope: scopeNational},
	{idLit: "MORTGAGE15US", metric: types.MetricMortgage15yRate, unit: types.UnitPercent, scope: scopeNational},

	// State-level FHFA HPI
	{idLit: "DCSTHPI", metric: types.MetricFhfaHpi, unit: types.UnitIndexOther, scope: scopeState},
	{idLit: "MDSTHPI", metric: types.MetricFhfaHpi, unit: types.UnitIndexOther, scope: scopeState},
	{idLit: "VASTHPI", metric: types.MetricFhfaHpi, unit: types.UnitIndexOther, scope: scopeState},

	// County FHFA HPI: ATNHPIUS{FIPS}A
	{idFn: func(fips string) string { return "ATNHPIUS" + fips + "A" }, metric: types.MetricFhfaHpi, unit: types.UnitIndexOther, scope: scopeCounty},

	// Realtor.com via FRED — county hotness score
	{idFn: func(fips string) string { return "HOSCCOUNTY" + fips }, metric: types.MetricHotnessScore, unit: types.UnitIndexOther, scope: scopeCounty},

	// Realtor.com — county median listing price
	{idFn: func(fips string) string { return "MELIPRCOUNTY" + fips }, metric: types.MetricMedianListPrice, unit: types.UnitUSD, scope: scopeCounty},
}

var stateSeriesToFIPS = map[string]string{
	"DCSTHPI": "11",
	"MDSTHPI": "24",
	"VASTHPI": "51",
}

type fredObservation struct {
	Date  string            `json:"date"`
	Value types.MaybeFloat  `json:"value"`
}

type fredResponse struct {
	Observations []fredObservation `json:"observations"`
}

type Source struct {
	cfg        Config
	client     *httpclient.Client
	logger     *slog.Logger
	countySleep time.Duration // override for tests
	baseURL     string        // override for tests
}

func New(cfg Config, client *httpclient.Client) *Source {
	return &Source{
		cfg:         cfg,
		client:      client,
		logger:      pkglog.Default(),
		countySleep: countySleepDelay,
		baseURL:     baseURL,
	}
}

func (s *Source) Name() string            { return "fred" }
func (s *Source) Cadence() types.Cadence  { return types.CadenceMonthly }

func (s *Source) Fetch(ctx context.Context) ([]types.Observation, error) {
	var out []types.Observation
	cs := counties.All()

	for _, spec := range series {
		switch spec.scope {
		case scopeNational:
			obs, err := s.fetchSeries(ctx, spec.idLit)
			if err != nil {
				s.logger.Warn("fred national series failed", "series", spec.idLit, "err", err)
				continue
			}
			out = append(out, toObservations(obs, spec, "USA", spec.idLit)...)
			s.logger.Info("fred fetched national series", "series", spec.idLit, "count", len(obs))

		case scopeState:
			fips, ok := stateSeriesToFIPS[spec.idLit]
			if !ok {
				s.logger.Warn("fred unknown state series", "series", spec.idLit)
				continue
			}
			obs, err := s.fetchSeries(ctx, spec.idLit)
			if err != nil {
				s.logger.Warn("fred state series failed", "series", spec.idLit, "err", err)
				continue
			}
			out = append(out, toObservations(obs, spec, fips, spec.idLit)...)
			s.logger.Info("fred fetched state series", "series", spec.idLit, "fips", fips, "count", len(obs))

		case scopeCounty:
			for _, c := range cs {
				id := spec.idFn(c.FIPS)
				obs, err := s.fetchSeries(ctx, id)
				if err != nil {
					s.logger.Warn("fred county series failed", "series", id, "fips", c.FIPS, "err", err)
				} else {
					out = append(out, toObservations(obs, spec, c.FIPS, id)...)
					s.logger.Info("fred fetched county series", "series", id, "fips", c.FIPS, "count", len(obs))
				}
				if err := sleepCtx(ctx, s.countySleep); err != nil {
					return out, err
				}
			}
		}
	}

	return out, nil
}

func (s *Source) fetchSeries(ctx context.Context, seriesID string) ([]fredObservation, error) {
	q := url.Values{}
	q.Set("series_id", seriesID)
	q.Set("api_key", s.cfg.APIKey)
	q.Set("file_type", "json")
	u := s.baseURL + "/series/observations?" + q.Encode()

	var resp fredResponse
	if err := s.client.GetJSON(ctx, u, "fred:"+seriesID, &resp); err != nil {
		return nil, fmt.Errorf("fetch %s: %w", seriesID, err)
	}
	return resp.Observations, nil
}

func toObservations(in []fredObservation, spec seriesSpec, fips, seriesID string) []types.Observation {
	out := make([]types.Observation, 0, len(in))
	for _, o := range in {
		if !o.Value.Valid {
			continue // "." sentinel or null
		}
		out = append(out, types.Observation{
			Source:     "fred",
			Series:     seriesID,
			FIPS:       fips,
			Metric:     spec.metric,
			ObservedAt: o.Date,
			Value:      o.Value.Val,
			Unit:       spec.unit,
		})
	}
	return out
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	if d == 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

