// Command ingest-all runs every DataSource sequentially and writes each
// result to go/.cache/{source}.json. A per-source failure is logged and
// collected; later sources still run. Exits non-zero if any source failed.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"

	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest/bls"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest/census"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest/fred"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest/qcew"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest/redfin"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest/zillow"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/storage"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

type config struct {
	FREDAPIKey   string `env:"FRED_API_KEY,required"`
	CensusAPIKey string `env:"CENSUS_API_KEY,required"`
	BLSAPIKey    string `env:"BLS_API_KEY,required"`
}

func main() {
	logger := pkglog.Default()

	_ = godotenv.Load(filepath.Join("..", ".env"))
	_ = godotenv.Load(".env")

	var cfg config
	if err := env.Parse(&cfg); err != nil {
		logger.Error("config parse failed", "err", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	apiClient := httpclient.New(httpclient.Options{Timeout: 60 * time.Second, MaxRetries: 3})
	bigClient := httpclient.New(httpclient.Options{Timeout: 300 * time.Second, MaxRetries: 3})

	sources := []ingest.DataSource{
		fred.New(fred.Config{APIKey: cfg.FREDAPIKey}, apiClient),
		census.New(census.Config{APIKey: cfg.CensusAPIKey}, apiClient),
		bls.New(bls.Config{APIKey: cfg.BLSAPIKey}, apiClient),
		qcew.New(apiClient),
		zillow.New(httpclient.New(httpclient.Options{Timeout: 120 * time.Second, MaxRetries: 3})),
		redfin.New(bigClient),
	}

	var errs []error
	for _, src := range sources {
		if err := runOne(ctx, src, logger); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", src.Name(), err))
		}
	}

	if len(errs) > 0 {
		logger.Error("ingest-all: one or more sources failed", "count", len(errs))
		for _, e := range errs {
			logger.Error("ingest-all failure", "err", e)
		}
		_ = errors.Join(errs...) // for documentation; pkglog already emitted each
		os.Exit(1)
	}
	logger.Info("ingest-all: complete")
}

func runOne(ctx context.Context, src ingest.DataSource, logger interface {
	Info(msg string, args ...any)
	Error(msg string, args ...any)
}) error {
	startedAt := time.Now().UTC()
	logger.Info("ingest:start", "source", src.Name(), "cadence", src.Cadence())

	obs, err := src.Fetch(ctx)
	if err != nil {
		logger.Error("ingest:failed", "source", src.Name(), "err", err)
		return err
	}

	finishedAt := time.Now().UTC()
	result := types.IngestResult{
		Source:       src.Name(),
		StartedAt:    startedAt.Format(time.RFC3339Nano),
		FinishedAt:   finishedAt.Format(time.RFC3339Nano),
		DurationMs:   finishedAt.Sub(startedAt).Milliseconds(),
		Count:        len(obs),
		Observations: obs,
	}
	path := filepath.Join(".cache", src.Name()+".json")
	if err := storage.WriteJSON(path, result); err != nil {
		logger.Error("cache write failed", "source", src.Name(), "path", path, "err", err)
		return err
	}
	logger.Info("ingest:done",
		"source", src.Name(),
		"count", len(obs),
		"durationMs", result.DurationMs,
		"cachePath", path,
	)
	return nil
}
