# Implementation Log

## Slice 1 — Per-source logger attribution

**What was done:**

- Added an identical `SetLogger(*slog.Logger)` method to each of the six `*Source` types in `go/internal/ingest/{fred,census,bls,qcew,zillow,redfin}/*.go`. Body is the same in all six packages: nil-guard then overwrite `s.logger`.
- Refactored `runOne` in `go/cmd/ingest-all/main.go`:
  - Replaced the anonymous `logger interface { Info; Error }` parameter with `*slog.Logger`.
  - Added an inline type-assertion `if ls, ok := src.(interface{ SetLogger(*slog.Logger) }); ok { ls.SetLogger(srcLogger) }` to inject the per-source-tagged logger.
  - Replaced inline `"source", src.Name()` kwargs on `ingest:start` / `ingest:done` / `ingest:failed` / `cache write failed` log lines with `srcLogger.With("source", …)` — same value, structured field instead of inline.
- Added `"log/slog"` import to `go/cmd/ingest-all/main.go`.

**Checkpoint result: PASS**

- `go build ./...` clean.
- `go vet ./...` clean.
- `golangci-lint run ./cmd/ingest-all/... ./internal/ingest/...` → 0 issues.
- `go test ./internal/ingest/...` all packages green (`bls`, `census`, `fred`, `qcew`, `redfin`, `zillow`).
- `gofmt -w` applied to every touched file; `gofmt -l` clean afterwards.

**Deviations:** Skipped the planned `go run ./cmd/ingest-fred 2>&1 | head -5` smoke check because FRED's 600 ms × 63 county sleep would take ~38 s; the `source=` attribute wiring is verified end-to-end by Slice 2's live diff (`source=fred` appears on every relevant log line in the captured output).

## Slice 2 — Concurrent fan-out in `cmd/ingest-all`

**What was done:**

- Added `golang.org/x/sync v0.20.0` to `go/go.mod`; `go mod tidy` cleaned up.
- Factored `cmd/ingest-all/main.go` into three functions:
  - `main()` — env setup + signal context + delegate to `run(...)` + `os.Exit(...)`.
  - `buildSources(cfg config) []ingest.DataSource` — verbatim from the prior `main` body.
  - `run(ctx, logger, sources) int` — orchestrator returning an exit code (testable).
- Replaced the serial `for _, src := range sources` loop with `errgroup.WithContext(ctx)`:
  - Each goroutine calls `runOne(gctx, src, logger)`; on error, takes a `sync.Mutex` and appends to a local `[]error`. Always returns `nil` from the goroutine so a single source's failure does not cancel the errgroup context for its siblings (preserves the "every source gets a chance" policy).
  - `g.Wait()` joins all goroutines; `_ =` swallows the always-nil return.
- New top-line log `ingest-all: started` (`sources` count) and replaced terminal `ingest-all: complete` with a richer version carrying `totalDurationMs`, `sources`, `failed`.
- Created `go/cmd/ingest-all/main_test.go` with three race-clean test cases using `fakeSource` (implements `ingest.DataSource` with configurable delay/error/obs count):
  - `TestRun_AllSucceed_ParallelNotSerial` — 6×100 ms fakes; asserts wall-clock < 400 ms (proves concurrency); all six caches written.
  - `TestRun_OneFails_OthersWriteCaches` — six fakes, one returns error; asserts exit code 1, failing source has no cache file, other five caches exist.
  - `TestRun_ContextCancelMidFlight` — three 5 s fakes, parent context cancelled after 50 ms; asserts fast return, exit 1, all `Fetch` calls observed cancellation.
  - Each test calls `t.Chdir(t.TempDir())` to sandbox `.cache/` writes.

**Checkpoint result: PASS**

- `go test ./cmd/ingest-all/... -v -count=1 -race` → all three pass; wall-clock 0.11 s for the all-succeed case (vs 600 ms serial).
- Full `go test ./... -race` → every package green.
- `golangci-lint run ./...` → 0 issues.
- Live run against real API keys (Darwin, home network):
  - `totalDurationMs:56939`, `/usr/bin/time -l real:58.15s`.
  - Serial baseline (from prior `.cache/*.json` on the same branch): sum of `durationMs` = 95,897 ms.
  - **Speedup: 40.6% wall-clock reduction**.
  - FRED dominates the new critical path (56,907 ms), matching the design prediction.
- Byte-equivalence diff per `.observations`-only sorted comparison: all six sources OK (zero diff).

**Deviations:**

- Did not declare a named `loggerSettable` interface type; used inline `interface{ SetLogger(*slog.Logger) }` at the single call site in `runOne`. Justified in the plan.
- Did not add an `INGEST_SEQUENTIAL=1` envvar toggle; deferred per the design open question. Re-adding it is mechanically trivial (~5 lines) if a future operational need surfaces.

## Slice 3 — Wall-clock measurement and verification gate

**What was done:**

- Captured the concurrent measurements during the Slice 2 live verification run (combined to avoid burning a second API quota).
- Wrote `docs/crispy/go-ingest-concurrency/verification.md` recording:
  - Sum of per-source `durationMs` (serial baseline 95,897 ms vs concurrent 101,266 ms — confirms each source did the same work).
  - Wall-clock `totalDurationMs` (concurrent 56,939 ms; **−40.6%** vs serial baseline).
  - Peak RSS via `/usr/bin/time -l`: 217,120,768 B (~207 MB).
  - Per-source `durationMs` table (concurrent vs serial).
  - Byte-equivalence diff result (all six caches OK).
  - Notes on which open research questions were resolved (Q4, Q13).

**Checkpoint result: PASS**

- `verification.md` exists, three numeric values populated.
- Wall-clock concurrent (56,939 ms) < sum-of-serial-durationMs (95,897 ms). Speedup is positive.
- Peak RSS (~207 MB) ≪ 1 GB loose ceiling ≪ runner's 7 GB.

**Deviations:** Combined Slice 2's live diff with Slice 3's measurement into a single live run rather than two. Plan called for two separate runs (one for diff, one for measurement) but they capture identical data; one run is enough.

## Summary

All three slices complete; all checkpoints pass.

- **Wall-clock reduction:** 40.6% (95.9 s → 56.9 s on the measurement host) on first concurrent run.
- **Critical path:** FRED's county-loop with 600 ms sleeps is now the binding floor. Parallelising FRED's county loop is a deferred follow-up per Design Decision 4.
- **Correctness:** `.cache/*.json` `.observations` byte-equivalent between serial baseline and concurrent run.
- **Resource use:** ~207 MB peak RSS — large headroom vs. the `ubuntu-latest` 7 GB ceiling.
- **Test coverage:** new `cmd/ingest-all/main_test.go` encodes the concurrency contract under `-race`.
- **No new dependencies** beyond `golang.org/x/sync` (idiomatic, single package).

Files touched:

- `go/internal/ingest/{fred,census,bls,qcew,zillow,redfin}/*.go` — added `SetLogger`.
- `go/cmd/ingest-all/main.go` — factored `main`/`buildSources`/`run`/`runOne`; errgroup fan-out; new log lines.
- `go/cmd/ingest-all/main_test.go` — new.
- `go/go.mod`, `go/go.sum` — `golang.org/x/sync v0.20.0` added.
- `docs/crispy/go-ingest-concurrency/verification.md` — new.

## Next
**Phase:** Delivery
**Artifact to review:** `docs/crispy/go-ingest-concurrency/6-implement.md`
**Action:** Review the implementation log. Then invoke `crispy-delivery` with project name `go-ingest-concurrency`.
