// Command transform reads every cache file under .cache/ and writes per-county
// JSON, metric series, and manifest into ../web/public/data/. Mirrors
// scripts/transform/build-county-pages.ts.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/storage"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/transform"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

const (
	cacheDir          = ".cache"
	defaultOutDataDir = "../web/public/data"
	dataSourcesMDPath = "../DATA_SOURCES.md"
	tsISOMillis       = "2006-01-02T15:04:05.000Z07:00"
)

// Source list must match scripts/transform/build-county-pages.ts SOURCES exactly
// for manifest ordering.
var knownSources = []string{"fred", "census", "bls", "zillow", "redfin", "qcew"}

type metricSeriesFile struct {
	Metric      types.MetricId      `json:"metric"`
	FIPS        string              `json:"fips"`
	Unit        types.Unit          `json:"unit"`
	Cadence     types.Cadence       `json:"cadence"`
	Source      string              `json:"source"`
	LastUpdated string              `json:"lastUpdated"`
	Points      []types.MetricPoint `json:"points"`
}

func main() {
	logger := pkglog.Default()

	outDir := os.Getenv("OUT_DATA_DIR")
	if outDir == "" {
		outDir = defaultOutDataDir
	}
	countiesDir := filepath.Join(outDir, "counties")
	metricsDir := filepath.Join(outDir, "metrics")
	manifestPath := filepath.Join(outDir, "manifest.json")
	mortgagePath := filepath.Join(metricsDir, "mortgage-rates.json")

	if err := os.MkdirAll(countiesDir, 0o755); err != nil {
		logger.Error("mkdir counties dir failed", "err", err)
		os.Exit(1)
	}
	if err := os.MkdirAll(metricsDir, 0o755); err != nil {
		logger.Error("mkdir metrics dir failed", "err", err)
		os.Exit(1)
	}

	obs, manifest, err := loadAllCaches(logger)
	if err != nil {
		logger.Error("load caches failed", "err", err)
		os.Exit(1)
	}
	if len(obs) == 0 {
		logger.Error("no observations loaded; run ingest first")
		os.Exit(1)
	}

	obs, dropped := transform.SortAndDeduplicate(obs)
	if dropped > 0 {
		logger.Warn("deduplicated observations", "dropped", dropped)
	}

	generatedAt := time.Now().UTC().Format(tsISOMillis)

	// Write mortgage-rates.json first so its file timestamp is consistent and
	// loadLatestMortgageRate can read it on re-runs.
	var mortgageObs []types.Observation
	for _, o := range obs {
		if o.Metric == types.MetricMortgage30yRate && o.FIPS == "USA" {
			mortgageObs = append(mortgageObs, o)
		}
	}
	if len(mortgageObs) > 0 {
		points := obsToPoints(mortgageObs)
		err = storage.WriteJSON(mortgagePath, metricSeriesFile{
			Metric:      types.MetricMortgage30yRate,
			FIPS:        "USA",
			Unit:        types.UnitPercent,
			Cadence:     types.CadenceWeekly,
			Source:      "fred",
			LastUpdated: generatedAt,
			Points:      points,
		})
		if err != nil {
			logger.Error("write mortgage-rates.json failed", "err", err)
			os.Exit(1)
		}
	}

	mortgageRate := loadLatestMortgageRate(mortgagePath, logger)
	// TS getPopulationByFips reads census cache for metric=='population' which
	// no ingester emits today, so it always returns {}. Match that exactly.
	extras := map[string]transform.CountyExtras{}

	pages, err := transform.BuildCountyPages(obs, counties.All(), extras,
		mustParseISO(generatedAt), transform.BuildOptions{MortgageRate: mortgageRate})
	if err != nil {
		logger.Error("build county pages failed", "err", err)
		os.Exit(1)
	}
	for _, p := range pages {
		path := filepath.Join(countiesDir, p.FIPS+".json")
		if err := storage.WriteJSON(path, p); err != nil {
			logger.Error("write county page failed", "fips", p.FIPS, "err", err)
			os.Exit(1)
		}
		logger.Info("wrote county summary", "fips", p.FIPS, "name", p.Name, "path", path)
	}

	if fed := transform.BuildFederalEmploymentDmv(obs, counties.All(), generatedAt); fed != nil {
		path := filepath.Join(metricsDir, "federal-employment-dmv.json")
		if err := storage.WriteJSON(path, fed); err != nil {
			logger.Error("write federal-employment-dmv.json failed", "err", err)
			os.Exit(1)
		}
	} else {
		logger.Warn("no fully-disclosed DMV quarters; skipping federal-employment-dmv.json")
	}

	if al := transform.BuildActiveListingsDmv(obs, counties.All(), generatedAt); al != nil {
		path := filepath.Join(metricsDir, "active-listings-dmv.json")
		if err := storage.WriteJSON(path, al); err != nil {
			logger.Error("write active-listings-dmv.json failed", "err", err)
			os.Exit(1)
		}
	} else {
		logger.Warn("no fully-covered DMV months; skipping active-listings-dmv.json")
	}

	verifications := transform.ReadVerificationFromMarkdown(dataSourcesMDPath)
	verifiedBy := map[string]string{}
	for _, v := range verifications {
		verifiedBy[v.Source] = v.LastVerified
	}
	for i := range manifest {
		if d, ok := verifiedBy[manifest[i].Name]; ok {
			d2 := d
			manifest[i].LastVerified = &d2
		}
	}

	m := transform.BuildManifest(manifest, mustParseISO(generatedAt))
	if err := storage.WriteJSON(manifestPath, m); err != nil {
		logger.Error("write manifest failed", "err", err)
		os.Exit(1)
	}
	logger.Info("transform complete", "counties", len(pages))
}

func obsToPoints(in []types.Observation) []types.MetricPoint {
	pts := make([]types.MetricPoint, 0, len(in))
	for _, o := range in {
		pts = append(pts, types.MetricPoint{Date: o.ObservedAt, Value: o.Value})
	}
	// stable date-sort
	for i := 1; i < len(pts); i++ {
		for j := i; j > 0 && pts[j-1].Date > pts[j].Date; j-- {
			pts[j-1], pts[j] = pts[j], pts[j-1]
		}
	}
	return pts
}

func loadLatestMortgageRate(path string, logger interface{ Warn(msg string, args ...any) }) *float64 {
	data, err := os.ReadFile(path)
	if err != nil {
		logger.Warn("no mortgage-rates.json yet; affordabilityIndex will be skipped")
		return nil
	}
	var raw metricSeriesFile
	if err := json.Unmarshal(data, &raw); err != nil {
		logger.Warn("mortgage-rates.json decode failed", "err", err)
		return nil
	}
	if len(raw.Points) == 0 {
		return nil
	}
	v := raw.Points[len(raw.Points)-1].Value / 100.0
	return &v
}

func loadAllCaches(logger interface {
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
}) ([]types.Observation, []transform.SourceMeta, error) {
	var all []types.Observation
	manifest := make([]transform.SourceMeta, 0, len(knownSources))

	for _, src := range knownSources {
		path := filepath.Join(cacheDir, src+".json")
		data, err := os.ReadFile(path)
		if err != nil {
			logger.Warn("no cache for source; skipping", "source", src, "err", err)
			manifest = append(manifest, transform.SourceMeta{
				Name:        src,
				Cadence:     transform.CadenceFor(src),
				LastUpdated: time.Unix(0, 0).UTC().Format(tsISOMillis),
				Status:      "stale",
			})
			continue
		}
		var cached types.IngestResult
		if err := json.Unmarshal(data, &cached); err != nil {
			return nil, nil, fmt.Errorf("decode %s: %w", path, err)
		}
		all = append(all, cached.Observations...)
		manifest = append(manifest, transform.SourceMeta{
			Name:        src,
			Cadence:     transform.CadenceFor(src),
			LastUpdated: cached.FinishedAt,
			Status:      "ok",
		})
		logger.Info("loaded cache", "source", src, "count", len(cached.Observations))
	}

	return all, manifest, nil
}

func mustParseISO(s string) time.Time {
	t, err := time.Parse(tsISOMillis, s)
	if err != nil {
		t, err = time.Parse(time.RFC3339Nano, s)
		if err != nil {
			return time.Now().UTC()
		}
	}
	return t
}
