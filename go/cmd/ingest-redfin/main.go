// Command ingest-redfin runs the Redfin ingester and writes the result to
// go/.cache/redfin.json.
package main

import (
	"context"
	"os"
	"os/signal"
	"path/filepath"
	"time"

	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest/redfin"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/storage"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

func main() {
	logger := pkglog.Default()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	client := httpclient.New(httpclient.Options{Timeout: 300 * time.Second, MaxRetries: 3})
	src := redfin.New(client)

	startedAt := time.Now().UTC()
	logger.Info("ingest:start", "source", src.Name(), "cadence", src.Cadence())

	obs, err := src.Fetch(ctx)
	if err != nil {
		logger.Error("ingest:failed", "source", src.Name(), "err", err)
		os.Exit(1)
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

	cachePath := filepath.Join(".cache", "redfin.json")
	if err := storage.WriteJSON(cachePath, result); err != nil {
		logger.Error("cache write failed", "path", cachePath, "err", err)
		os.Exit(1)
	}

	logger.Info("ingest:done",
		"source", src.Name(),
		"count", len(obs),
		"durationMs", result.DurationMs,
		"cachePath", cachePath,
	)
}
