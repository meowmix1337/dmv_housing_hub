# Plan

Three slices, each independently mergeable. All paths relative to repo root unless noted.

## Conventions

- All Go work happens with `working-directory: go/`. The `go.mod` lives at `go/go.mod`; commands below assume `cd go` first or `-C go` on commands that support it.
- New imports use the project's existing module path `github.com/meowmix1337/dmv_housing_hub/go/...`.
- Conventional commit prefix: `refactor:` for Slice 1 (no behaviour change), `perf:` for Slice 2 (wall-clock win), `docs:` for Slice 3.
- Run `gofmt -w` on every touched `.go` file before committing.
- Quality gates before commit: `cd go && go test ./...` and `cd go && golangci-lint run` (CI runs both; the latter exists per `020c781 ci(go): wire golangci-lint v2 into CI and make lint`).

## Slice 1 — Per-source logger attribution

### Files to modify

- `go/internal/ingest/fred/fred.go`
- `go/internal/ingest/census/census.go`
- `go/internal/ingest/bls/bls.go`
- `go/internal/ingest/qcew/qcew.go`
- `go/internal/ingest/zillow/zillow.go`
- `go/internal/ingest/redfin/redfin.go`
- `go/cmd/ingest-all/main.go`

### Steps

1. **Add `SetLogger` on each `*Source`.** Each of the six packages already holds a `logger *slog.Logger` field. Append a method right after `New(...)` in each file:

   ```go
   // SetLogger overrides the package-default logger. Used by cmd/ingest-all
   // to inject a per-source attribute on every record.
   func (s *Source) SetLogger(l *slog.Logger) {
       if l != nil {
           s.logger = l
       }
   }
   ```

   Identical body in all six packages. No other source-level change.

2. **Wire injection in `runOne`.** In `go/cmd/ingest-all/main.go`, modify `runOne` so the logger it logs through is itself tagged. Replace the current `runOne` signature's `logger interface { Info/Error }` constraint with `*slog.Logger`, and inside `runOne`:

   ```go
   srcLogger := logger.With("source", src.Name())
   if ls, ok := src.(interface{ SetLogger(*slog.Logger) }); ok {
       ls.SetLogger(srcLogger)
   }
   ```

   Use `srcLogger` (not the parent `logger`) for `ingest:start` / `ingest:done` / `ingest:failed`. The `source` attribute is now redundant on those records — that is fine; the `With` attribute and any inline `"source", src.Name()` kwargs in the existing calls deduplicate to the same value.

3. **Drop the now-redundant inline `"source", src.Name()` kwargs** from `ingest:start`, `ingest:done`, `ingest:failed`, `ingest:cache write failed` calls in `runOne`. The `With` attribute supplies them.

4. **Adjust the `runOne` caller site in `main`.** Pass `logger` (the `*slog.Logger` from `pkglog.Default()`) directly. Replace the anonymous interface parameter in `runOne` with `*slog.Logger`.

### Verification

```bash
cd go
gofmt -l ./... # expect empty
go vet ./...
go test ./internal/ingest/...
golangci-lint run

# Smoke-run one ingester locally (requires FRED_API_KEY in repo-root .env).
go run ./cmd/ingest-fred 2>&1 | head -5
# Expect every line to contain `source=fred`.
```

Expected outcome:

- All existing tests pass without modification.
- `go run ./cmd/ingest-fred` log output gains a `source=fred` attribute on every record (including mid-fetch records like `"fred fetched national series"`).
- No change to `.cache/fred.json` contents (byte-equal to a pre-change run).

## Slice 2 — Concurrent fan-out in `cmd/ingest-all`

### Files to modify / create

- `go/cmd/ingest-all/main.go` (modify)
- `go/cmd/ingest-all/main_test.go` (new)
- `go/go.mod`, `go/go.sum` (add `golang.org/x/sync` if not already present)

### Steps

1. **Confirm or add `golang.org/x/sync` dependency.**

   ```bash
   cd go
   grep 'golang.org/x/sync' go.mod || go get golang.org/x/sync
   go mod tidy
   ```

2. **Factor `main` into a testable `run(ctx, logger, sources) int`.** Move the source slice construction (`config` parse, `httpclient.New` calls, `[]ingest.DataSource{...}`) and the orchestration loop into a new function:

   ```go
   func run(ctx context.Context, logger *slog.Logger, sources []ingest.DataSource) int { ... }
   ```

   `main` becomes:

   ```go
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

       sources := buildSources(cfg)
       os.Exit(run(ctx, logger, sources))
   }
   ```

   Add a small `buildSources(cfg config) []ingest.DataSource` helper containing the existing six constructions verbatim so `main_test.go` can substitute fakes.

3. **Replace the serial loop in `run` with `errgroup`.** Inside `run`:

   ```go
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
           return nil // never propagate — siblings must keep running
       })
   }
   _ = g.Wait() // returns nil; errors are in `errs`

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
       _ = errors.Join(errs...) // unchanged comment-marker
       return 1
   }
   return 0
   ```

   Import additions: `golang.org/x/sync/errgroup`, `sync`.

4. **Remove the old top-of-`main` `logger.Info("ingest-all: complete")`** terminal call (now subsumed by step 3's final log).

5. **Create `go/cmd/ingest-all/main_test.go`** with three test cases against fake `ingest.DataSource` implementations. Cache files for fakes must use unique source names (e.g., `fake1`, `fake2`, …) so a stray `.cache/fake1.json` from a previous test doesn't collide with a real cache. Tests `t.Chdir` (Go 1.24+) into a fresh `t.TempDir()` so `.cache/` writes are sandboxed.

   Sketch:

   ```go
   type fakeSource struct {
       name   string
       delay  time.Duration
       err    error
       obsN   int
       called atomic.Bool
   }
   func (f *fakeSource) Name() string                              { return f.name }
   func (f *fakeSource) Cadence() types.Cadence                    { return types.CadenceMonthly }
   func (f *fakeSource) Fetch(ctx context.Context) ([]types.Observation, error) {
       f.called.Store(true)
       select {
       case <-time.After(f.delay):
       case <-ctx.Done():
           return nil, ctx.Err()
       }
       if f.err != nil { return nil, f.err }
       return make([]types.Observation, f.obsN), nil
   }
   ```

   Cases:

   - `TestRun_AllSucceed_ParallelNotSerial`: six fakes each with 100 ms delay. Assert wall-clock < 250 ms (well under 600 ms serial). Assert all six caches exist.
   - `TestRun_OneFails_OthersWriteCaches`: six fakes, one returns `errors.New("boom")`. Assert exit code = 1, five caches exist, the failing source's cache does NOT exist (per `runOne` skipping `WriteJSON` on error).
   - `TestRun_ContextCancelMidFlight`: spawn fakes with 5 s delay, cancel parent context after 50 ms. Assert exit code = 1, all `Fetch` calls observed cancellation (or returned `context.Canceled`).

### Verification

```bash
cd go
go test ./cmd/ingest-all/... -v -count=1 -race
go test ./... -race
golangci-lint run

# Live diff against pre-change baseline (requires API keys in .env).
git stash # save concurrent change
go run ./cmd/ingest-all && cp -r .cache /tmp/cache-serial
git stash pop
go run ./cmd/ingest-all && cp -r .cache /tmp/cache-concurrent

for f in /tmp/cache-serial/*.json; do
  name=$(basename "$f")
  diff <(jq -S '.observations | sort_by(.source, .series, .fips, .observedAt)' "/tmp/cache-serial/$name") \
       <(jq -S '.observations | sort_by(.source, .series, .fips, .observedAt)' "/tmp/cache-concurrent/$name") \
       || echo "$name DIFFERS"
done
# Expect: zero diff per source.
```

Expected outcome:

- All tests pass with `-race`.
- Live concurrent run produces byte-equivalent `.cache/*.json` (modulo `startedAt`/`finishedAt`/`durationMs` fields, which are timestamps and will differ — restrict the diff to `.observations`).
- Total wall-clock from the log is bounded below by Redfin's solo duration, not the sum of all six.

## Slice 3 — Wall-clock measurement and verification gate

### Files to create

- `docs/crispy/go-ingest-concurrency/verification.md`

### Steps

1. **Capture a baseline** by running the workflow on `main` (pre-merge) once, or by checking out `main` locally and running `go run ./cmd/ingest-all` with real keys. Read the per-source `durationMs` values from `.cache/*.json` and sum them. Record that number as `baseline_total_durationMs`.

   ```bash
   git checkout main
   cd go && go run ./cmd/ingest-all
   jq '.durationMs' .cache/*.json | paste -sd+ - | bc
   ```

2. **Capture the concurrent total** after merging Slice 2, by running `go run ./cmd/ingest-all` from the feature branch and grepping the new `ingest-all: complete` log line for `totalDurationMs`.

3. **Capture peak RSS locally** under the concurrent shape:

   ```bash
   # Darwin
   /usr/bin/time -l go run ./cmd/ingest-all 2>&1 | grep 'maximum resident'
   # Linux
   /usr/bin/time -v go run ./cmd/ingest-all 2>&1 | grep 'Maximum resident'
   ```

4. **Write `docs/crispy/go-ingest-concurrency/verification.md`** with this content (numbers substituted):

   ```markdown
   # Verification — go-ingest-concurrency

   Wall-clock and memory measurements taken on <date>, host = <darwin/linux>, network = <home/runner>.

   | Metric                       | Baseline (serial) | After (concurrent) |
   |------------------------------|-------------------|--------------------|
   | Sum of per-source durationMs | N ms              | N ms (≈ unchanged) |
   | Wall-clock totalDurationMs   | N ms              | N ms (target: ≈ max) |
   | Peak RSS                     | not measured      | N MB               |

   ## Notes
   - Baseline read from `main` commit <sha> via `jq '.durationMs' .cache/*.json | paste -sd+ - | bc`.
   - Concurrent total read from the `ingest-all: complete` log line emitted by `cmd/ingest-all`.
   - Peak RSS measured via `/usr/bin/time -l` (Darwin) / `-v` (Linux).
   - Predicted lower bound for concurrent wall-clock: max(per-source durationMs), dominated by Redfin.
   ```

5. **Decline `INGEST_SEQUENTIAL=1` for v1** per the design open question. If the verification run surfaces a real-world need (e.g., one upstream misbehaves under load), revisit; the toggle is a ~5-line addition (`if os.Getenv("INGEST_SEQUENTIAL") == "1" { ... }` calling the pre-Slice-2 serial loop, which would have to be re-introduced).

### Verification

- `docs/crispy/go-ingest-concurrency/verification.md` exists, has three numeric values populated.
- `wall-clock totalDurationMs (concurrent) < sum of per-source durationMs (baseline)`. If not, something is wrong (likely the runner is serialising over network or the errgroup wiring is misconfigured).
- Peak RSS < 1 GB (loose ceiling vs. ubuntu-latest's 7 GB).

## Deviations from design

- **None substantive.** Slice 2 step 5 uses `t.Chdir` (Go 1.24+) for cache isolation in tests; the repo is on Go 1.26 (per `.github/workflows/ingest.yml`), so this is in-bounds.
- The `loggerSettable` interface from the outline is *not* declared as a named type. It is used inline via `interface{ SetLogger(*slog.Logger) }` type-assertion at the single call site in `runOne`. A named type would be over-abstraction for one consumer.
- Slice 3 declines the `INGEST_SEQUENTIAL=1` toggle in v1, per the design open question. Re-adding it is mechanically trivial; deferring keeps the surface area smaller.

## Next
**Phase:** Implement
**Artifact to review:** `docs/crispy/go-ingest-concurrency/5-plan.md`
**Action:** Review structure and key decisions — this is a spot-check document. Then invoke `crispy-implement` with project name `go-ingest-concurrency`.
