// Command transform reads every cache file under .cache/ and writes per-county
// JSON, metric series, and manifest into ../web/public/data/. Mirrors
// scripts/transform/build-county-pages.ts; Slice 2 is FRED-only.
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
)

var knownSources = []string{"fred", "census", "bls", "zillow", "redfin", "qcew"}

func main() {
	logger := pkglog.Default()

	outDir := os.Getenv("OUT_DATA_DIR")
	if outDir == "" {
		outDir = defaultOutDataDir
	}
	countiesDir := filepath.Join(outDir, "counties")
	manifestPath := filepath.Join(outDir, "manifest.json")

	obs, manifest, err := loadAllCaches(logger)
	if err != nil {
		logger.Error("load caches failed", "err", err)
		os.Exit(1)
	}

	generatedAt := time.Now().UTC()
	pages, err := transform.BuildCountyPages(obs, counties.All(), nil, generatedAt)
	if err != nil {
		logger.Error("build county pages failed", "err", err)
		os.Exit(1)
	}

	if err := os.MkdirAll(countiesDir, 0o755); err != nil {
		logger.Error("mkdir counties dir failed", "err", err)
		os.Exit(1)
	}
	for _, p := range pages {
		path := filepath.Join(countiesDir, p.FIPS+".json")
		if err := storage.WriteJSON(path, p); err != nil {
			logger.Error("write county page failed", "fips", p.FIPS, "err", err)
			os.Exit(1)
		}
	}

	m := transform.BuildManifest(manifest, generatedAt)
	if err := storage.WriteJSON(manifestPath, m); err != nil {
		logger.Error("write manifest failed", "err", err)
		os.Exit(1)
	}

	logger.Info("transform:done", "counties", len(pages), "sources", len(manifest), "outDir", outDir)
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
			logger.Warn("cache missing for source", "source", src, "err", err)
			manifest = append(manifest, transform.SourceMeta{
				Name:        src,
				Cadence:     transform.CadenceFor(src),
				LastUpdated: time.Unix(0, 0).UTC().Format(time.RFC3339),
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
