// Command ingest-qcew runs the QCEW ingester and writes the result to
// go/.cache/qcew.json.
package main

import (
	"context"
	"os"
	"os/signal"
	"path/filepath"
	"time"

	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest/qcew"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/storage"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

func main() {
	logger := pkglog.Default()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	client := httpclient.New(httpclient.Options{Timeout: 60 * time.Second, MaxRetries: 3})
	src := qcew.New(client)

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

	cachePath := filepath.Join(".cache", "qcew.json")
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
