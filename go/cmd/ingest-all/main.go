// Command ingest-all runs every DataSource concurrently and writes each
// result to go/.cache/{source}.json. A per-source failure is logged and
// collected; sibling sources still run. Exits non-zero if any source failed.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
	"golang.org/x/sync/errgroup"

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

	os.Exit(run(ctx, logger, buildSources(cfg)))
}

func buildSources(cfg config) []ingest.DataSource {
	apiClient := httpclient.New(httpclient.Options{Timeout: 60 * time.Second, MaxRetries: 3})
	bigClient := httpclient.New(httpclient.Options{Timeout: 300 * time.Second, MaxRetries: 3})

	return []ingest.DataSource{
		fred.New(fred.Config{APIKey: cfg.FREDAPIKey}, apiClient),
		census.New(census.Config{APIKey: cfg.CensusAPIKey}, apiClient),
		bls.New(bls.Config{APIKey: cfg.BLSAPIKey}, apiClient),
		qcew.New(apiClient),
		zillow.New(httpclient.New(httpclient.Options{Timeout: 120 * time.Second, MaxRetries: 3})),
		redfin.New(bigClient),
	}
}

// run orchestrates the six DataSources concurrently. Errors from individual
// sources are collected; siblings keep running. Returns 0 on full success,
// 1 if any source failed. Exposed as a separate function so main_test.go
// can drive it with fake sources.
func run(ctx context.Context, logger *slog.Logger, sources []ingest.DataSource) int {
	startedAt := time.Now().UTC()
	logger.Info("ingest-all: started", "sources", len(sources))

	g, gctx := errgroup.WithContext(ctx)
	var mu sync.Mutex
	var errs []error

	for _, src := range sources {
		src := src
		g.Go(func() error {
			if err := runOne(gctx, src, logger); err != nil {
				mu.Lock()
				errs = append(errs, fmt.Errorf("%s: %w", src.Name(), err))
				mu.Unlock()
			}
			// Always return nil so a failure in one source does not cancel
			// the errgroup context for its siblings.
			return nil
		})
	}
	_ = g.Wait()

	totalMs := time.Since(startedAt).Milliseconds()
	logger.Info("ingest-all: complete",
		"totalDurationMs", totalMs,
		"sources", len(sources),
		"failed", len(errs),
	)

	if len(errs) > 0 {
		for _, e := range errs {
			logger.Error("ingest-all failure", "err", e)
		}
		_ = errors.Join(errs...) // for documentation; pkglog already emitted each
		return 1
	}
	return 0
}

func runOne(ctx context.Context, src ingest.DataSource, logger *slog.Logger) error {
	srcLogger := logger.With("source", src.Name())
	if ls, ok := src.(interface{ SetLogger(*slog.Logger) }); ok {
		ls.SetLogger(srcLogger)
	}

	startedAt := time.Now().UTC()
	srcLogger.Info("ingest:start", "cadence", src.Cadence())

	obs, err := src.Fetch(ctx)
	if err != nil {
		srcLogger.Error("ingest:failed", "err", err)
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
		srcLogger.Error("cache write failed", "path", path, "err", err)
		return err
	}
	srcLogger.Info("ingest:done",
		"count", len(obs),
		"durationMs", result.DurationMs,
		"cachePath", path,
	)
	return nil
}
