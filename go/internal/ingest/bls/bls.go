// Package bls ports scripts/ingest/bls.ts. One POST to the BLS public v2 API
// with all DMV county LAUS series plus the federal-employment MSA series.
// M13 annual averages are dropped; M01–M12 become observedAt = year-MM-01.
package bls

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

const (
	apiURL           = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
	startYear        = "2015"
	endYear          = "2026"
	msaFederalSeries = "SMU11479009091000001"
	msaFederalFIPS   = "11-metro"
	requestSucceeded = "REQUEST_SUCCEEDED"
)

type Config struct {
	APIKey string `env:"BLS_API_KEY,required"`
}

type seriesMeta struct {
	fips   string
	metric types.MetricId
	unit   types.Unit
}

type requestBody struct {
	SeriesID        []string `json:"seriesid"`
	StartYear       string   `json:"startyear"`
	EndYear         string   `json:"endyear"`
	RegistrationKey string   `json:"registrationkey"`
}

type dataPoint struct {
	Year   string `json:"year"`
	Period string `json:"period"`
	Value  string `json:"value"`
}

type seriesEntry struct {
	SeriesID string      `json:"seriesID"`
	Data     []dataPoint `json:"data"`
}

type apiResponse struct {
	Status  string   `json:"status"`
	Message []string `json:"message"`
	Results struct {
		Series []seriesEntry `json:"series"`
	} `json:"Results"`
}

// PeriodToISO converts a BLS year + period code to ISO date.
// Returns "" for M13 (annual average) which callers must skip.
func PeriodToISO(year, period string) string {
	if period == "M13" {
		return ""
	}
	month := strings.TrimPrefix(period, "M")
	if len(month) == 1 {
		month = "0" + month
	}
	return year + "-" + month + "-01"
}

func buildSeriesMeta() map[string]seriesMeta {
	m := make(map[string]seriesMeta, len(counties.All())+1)
	for _, c := range counties.All() {
		m["LAUCN"+c.FIPS+"0000000003"] = seriesMeta{
			fips:   c.FIPS,
			metric: types.MetricUnemploymentRate,
			unit:   types.UnitPercent,
		}
	}
	m[msaFederalSeries] = seriesMeta{
		fips:   msaFederalFIPS,
		metric: types.MetricFederalEmployment,
		unit:   types.UnitCount,
	}
	return m
}

type Source struct {
	cfg    Config
	client *httpclient.Client
	logger *slog.Logger
	apiURL string // override for tests
}

func New(cfg Config, client *httpclient.Client) *Source {
	return &Source{
		cfg:    cfg,
		client: client,
		logger: pkglog.Default(),
		apiURL: apiURL,
	}
}

func (s *Source) Name() string           { return "bls" }
func (s *Source) Cadence() types.Cadence { return types.CadenceMonthly }

// SetLogger overrides the package-default logger. Used by cmd/ingest-all
// to inject a per-source attribute on every record.
func (s *Source) SetLogger(l *slog.Logger) {
	if l != nil {
		s.logger = l
	}
}

func (s *Source) Fetch(ctx context.Context) ([]types.Observation, error) {
	meta := buildSeriesMeta()
	ids := make([]string, 0, len(meta))
	for id := range meta {
		ids = append(ids, id)
	}

	s.logger.Info("bls: posting batch request", "count", len(ids))

	body, err := json.Marshal(requestBody{
		SeriesID:        ids,
		StartYear:       startYear,
		EndYear:         endYear,
		RegistrationKey: s.cfg.APIKey,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal bls request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("new bls request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("bls batch request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	var raw apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode bls response: %w", err)
	}

	return ParseResponse(raw, meta, s.logger)
}

// ParseResponse turns a decoded BLS response into Observations.
// Exported so unit tests can exercise it without HTTP.
func ParseResponse(raw apiResponse, meta map[string]seriesMeta, logger *slog.Logger) ([]types.Observation, error) {
	if logger == nil {
		logger = pkglog.Default()
	}
	if raw.Status != requestSucceeded {
		msg := strings.Join(raw.Message, "; ")
		if msg == "" {
			msg = "unknown error"
		}
		return nil, fmt.Errorf("bls request failed: %s", msg)
	}

	received := make(map[string]struct{}, len(raw.Results.Series))
	for _, s := range raw.Results.Series {
		received[s.SeriesID] = struct{}{}
	}
	for id := range meta {
		if _, ok := received[id]; !ok {
			logger.Warn("bls: series absent from response", "series", id)
		}
	}

	out := make([]types.Observation, 0)
	for _, s := range raw.Results.Series {
		m, ok := meta[s.SeriesID]
		if !ok {
			logger.Warn("bls: unexpected series in response; skipping", "series", s.SeriesID)
			continue
		}
		count := 0
		for _, p := range s.Data {
			observedAt := PeriodToISO(p.Year, p.Period)
			if observedAt == "" {
				continue
			}
			val, err := strconv.ParseFloat(p.Value, 64)
			if err != nil {
				continue
			}
			out = append(out, types.Observation{
				Source:     "bls",
				Series:     s.SeriesID,
				FIPS:       m.fips,
				Metric:     m.metric,
				ObservedAt: observedAt,
				Value:      val,
				Unit:       m.unit,
			})
			count++
		}
		logger.Info("bls: parsed series", "series", s.SeriesID, "fips", m.fips, "count", count)
	}
	return out, nil
}
