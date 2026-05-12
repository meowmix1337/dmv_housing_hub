package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/ingest"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

type fakeSource struct {
	name   string
	delay  time.Duration
	err    error
	obsN   int
	called atomic.Bool
}

func (f *fakeSource) Name() string           { return f.name }
func (f *fakeSource) Cadence() types.Cadence { return types.CadenceMonthly }
func (f *fakeSource) Fetch(ctx context.Context) ([]types.Observation, error) {
	f.called.Store(true)
	select {
	case <-time.After(f.delay):
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if f.err != nil {
		return nil, f.err
	}
	return make([]types.Observation, f.obsN), nil
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func sandboxCacheDir(t *testing.T) {
	t.Helper()
	t.Chdir(t.TempDir())
}

func TestRun_AllSucceed_ParallelNotSerial(t *testing.T) {
	sandboxCacheDir(t)

	const per = 100 * time.Millisecond
	srcs := []ingest.DataSource{
		&fakeSource{name: "fake1", delay: per, obsN: 1},
		&fakeSource{name: "fake2", delay: per, obsN: 2},
		&fakeSource{name: "fake3", delay: per, obsN: 3},
		&fakeSource{name: "fake4", delay: per, obsN: 4},
		&fakeSource{name: "fake5", delay: per, obsN: 5},
		&fakeSource{name: "fake6", delay: per, obsN: 6},
	}

	startedAt := time.Now()
	code := run(context.Background(), discardLogger(), srcs)
	elapsed := time.Since(startedAt)

	if code != 0 {
		t.Fatalf("run() returned exit code %d, want 0", code)
	}
	// Six fakes × 100 ms each = 600 ms serial. Concurrent: ≈ 100 ms.
	// Allow generous slack for CI: anything below 400 ms proves overlap.
	if elapsed >= 400*time.Millisecond {
		t.Errorf("run() took %v; expected concurrent overlap (≪ 600 ms serial)", elapsed)
	}
	for _, s := range srcs {
		path := filepath.Join(".cache", s.Name()+".json")
		if _, err := os.Stat(path); err != nil {
			t.Errorf("expected cache file %s, got: %v", path, err)
		}
	}
}

func TestRun_OneFails_OthersWriteCaches(t *testing.T) {
	sandboxCacheDir(t)

	boom := errors.New("boom")
	srcs := []ingest.DataSource{
		&fakeSource{name: "fake1", delay: 10 * time.Millisecond, obsN: 1},
		&fakeSource{name: "fake2", delay: 10 * time.Millisecond, err: boom},
		&fakeSource{name: "fake3", delay: 10 * time.Millisecond, obsN: 3},
		&fakeSource{name: "fake4", delay: 10 * time.Millisecond, obsN: 4},
		&fakeSource{name: "fake5", delay: 10 * time.Millisecond, obsN: 5},
		&fakeSource{name: "fake6", delay: 10 * time.Millisecond, obsN: 6},
	}

	code := run(context.Background(), discardLogger(), srcs)
	if code != 1 {
		t.Fatalf("run() returned exit code %d, want 1", code)
	}
	for _, s := range srcs {
		path := filepath.Join(".cache", s.Name()+".json")
		_, err := os.Stat(path)
		if s.Name() == "fake2" {
			if !os.IsNotExist(err) {
				t.Errorf("failing source %s should NOT have a cache file; got err=%v", s.Name(), err)
			}
		} else {
			if err != nil {
				t.Errorf("expected cache file for %s, got: %v", s.Name(), err)
			}
		}
	}
}

func TestRun_ContextCancelMidFlight(t *testing.T) {
	sandboxCacheDir(t)

	srcs := []ingest.DataSource{
		&fakeSource{name: "fake1", delay: 5 * time.Second, obsN: 1},
		&fakeSource{name: "fake2", delay: 5 * time.Second, obsN: 2},
		&fakeSource{name: "fake3", delay: 5 * time.Second, obsN: 3},
	}

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	startedAt := time.Now()
	code := run(ctx, discardLogger(), srcs)
	elapsed := time.Since(startedAt)

	if code != 1 {
		t.Fatalf("run() returned exit code %d, want 1 (context cancelled)", code)
	}
	if elapsed >= 1*time.Second {
		t.Errorf("run() took %v after cancel; expected fast return", elapsed)
	}
	for _, s := range srcs {
		fs := s.(*fakeSource)
		if !fs.called.Load() {
			t.Errorf("source %s never had Fetch called", fs.name)
		}
	}
}
