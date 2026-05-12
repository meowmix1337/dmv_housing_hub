# Delivery

## Summary

`cmd/ingest-all` now runs the six ingest sources (FRED, Census, BLS, QCEW, Zillow, Redfin) concurrently via `golang.org/x/sync/errgroup`, instead of one after another. The orchestrator's "every source runs, exit 1 if any failed" policy is preserved: per-source errors are collected into a mutex-guarded slice and surfaced after `g.Wait()`, and sibling failures never cancel the errgroup context. Each source's `slog` records now carry a structured `source="…"` attribute (injected by `cmd/ingest-all` via a new `SetLogger(*slog.Logger)` method on each `*Source`), so interleaved output stays attributable.

Measured wall-clock on the first concurrent run dropped from ~95.9 s (serial baseline) to ~56.9 s — **a 40.6% reduction** — while producing byte-equivalent `.cache/*.json` observations. FRED's county-loop, with its 600 ms inter-call sleep at 120 req/min, is now the binding floor; further speedup requires parallelising FRED's county fetches, which has been deferred. Peak RSS measured at ~207 MB on Darwin, well under the `ubuntu-latest` runner ceiling.

The change is delivered as PR [#13](https://github.com/meowmix1337/dmv_housing_hub/pull/13) on branch `feat/go-ingest-concurrency`.

## Changes

### Code

| File                                     | Change |
|------------------------------------------|--------|
| `go/cmd/ingest-all/main.go`              | Factored `main` into `main`/`buildSources`/`run(...) int`/`runOne`. Replaced the serial loop with `errgroup.WithContext`, mutex-guarded `[]error`, and goroutines that always return `nil` so failures do not cancel siblings. Added `ingest-all: started` log line and enriched the terminal log with `totalDurationMs`, `sources`, `failed`. `runOne` now takes a `*slog.Logger` and injects a `logger.With("source", …)` into each source via type-asserted `SetLogger`. |
| `go/cmd/ingest-all/main_test.go` (new)   | Three race-clean cases: `TestRun_AllSucceed_ParallelNotSerial`, `TestRun_OneFails_OthersWriteCaches`, `TestRun_ContextCancelMidFlight`. Uses a `fakeSource` and `t.Chdir(t.TempDir())` to sandbox `.cache/` writes. |
| `go/internal/ingest/{bls,census,fred,qcew,redfin,zillow}/*.go` | Each `*Source` gained an identical `SetLogger(*slog.Logger)` method (nil-guarded). No other source-level changes. |
| `go/go.mod`, `go/go.sum`                 | Added `golang.org/x/sync v0.20.0` (sole new dependency). |

### Docs

| File                                                       | Content |
|------------------------------------------------------------|---------|
| `docs/crispy/go-ingest-concurrency/0-task.md`              | Original task statement. |
| `docs/crispy/go-ingest-concurrency/1-questions.md`         | Research questions (16). |
| `docs/crispy/go-ingest-concurrency/2-research.md`          | Findings: current execution shape, rate limits, primitives, observability, resource budget, failure semantics. |
| `docs/crispy/go-ingest-concurrency/3-design.md`            | Six architecture decisions (inter-source concurrency, errgroup, source-tagged slog, defer within-source parallelism, no semaphore, aggregate wall-clock timing). |
| `docs/crispy/go-ingest-concurrency/4-outline.md`           | Three vertical slices plus key interfaces. |
| `docs/crispy/go-ingest-concurrency/5-plan.md`              | Tactical, step-by-step plan. |
| `docs/crispy/go-ingest-concurrency/6-implement.md`         | Implementation log per slice with checkpoint pass/fail and deviations. |
| `docs/crispy/go-ingest-concurrency/verification.md`        | Wall-clock and RSS numbers, per-source `durationMs` comparison, open-question resolution. |
| `docs/crispy/go-ingest-concurrency/7-delivery.md` (this)   | Delivery summary. |

## Verification

| Checkpoint                                            | Result |
|--------------------------------------------------------|--------|
| `go build ./...`, `go vet ./...`                       | Pass |
| `golangci-lint run ./...`                              | 0 issues |
| `go test ./... -race`                                  | All packages green; new `cmd/ingest-all` tests pass under `-race` |
| `gofmt -l` on touched files                            | Clean |
| Live concurrent run wall-clock                         | 56,939 ms (`totalDurationMs`); `/usr/bin/time -l real` = 58.15 s |
| Live serial baseline wall-clock (sum of `durationMs`)  | 95,897 ms |
| Speedup                                                | **40.6%** wall-clock reduction |
| Byte-equivalence diff per `.observations`              | All six caches OK (zero diff vs baseline) |
| Peak RSS (`/usr/bin/time -l`)                          | ~207 MB |

## Remaining items

- **Parallelise FRED's county loop** (deferred per Design Decision 4). FRED is now the binding wall-clock floor at 56.9 s, dominated by 600 ms × ~60 sequential county GETs against the 120 req/min FRED quota. A token-bucket-pacing rewrite could drop FRED to ~30 s, bringing total wall-clock closer to QCEW's ~22 s.
- **`INGEST_SEQUENTIAL=1` kill-switch envvar** (Design open question, deferred). Not added in v1. Re-adding is mechanically trivial if a future operational need surfaces.
- **BLS LAUS/CES vs QCEW shared-domain rate-limit posture** (Research open question Q5/Q7, Design open question). Both endpoints sit under `bls.gov`; we did not establish whether BLS treats `api.bls.gov` and `data.bls.gov` as a single tenant. The current run produced no 429s, so this is a watch-item, not a blocker. Captured in the PR test plan.
- **Combined-pipeline RSS on the `ubuntu-latest` runner**. Only measured on Darwin (~207 MB). The runner has 7 GB so headroom is large, but a one-time check against the actual CI run is on the PR test plan.
- **PR #13 review and merge.** Branch `feat/go-ingest-concurrency` pushed; PR open at <https://github.com/meowmix1337/dmv_housing_hub/pull/13>.

## How to use

- **Run the full pipeline locally:** `make ingest` (or `cd go && go run ./cmd/ingest-all`) — now writes the six `.cache/*.json` files in roughly the time the slowest source takes, not the sum. The new top-line log entry is:

  ```
  {"level":"INFO","msg":"ingest-all: complete","totalDurationMs":56939,"sources":6,"failed":0}
  ```

- **Filter logs by source:** every per-source record now carries `"source":"…"` as a structured field. Example:

  ```
  jq 'select(.source=="fred")' < ingest.log
  ```

- **Add a new ingester:** the `DataSource` interface is unchanged (`Name()`, `Cadence()`, `Fetch(ctx)`). Add an optional `SetLogger(*slog.Logger)` method on the new source to opt into source-tagged logging; the orchestrator type-asserts and injects automatically. Append the constructor to `buildSources` in `cmd/ingest-all/main.go` and the new source will run alongside the existing six.

- **Run the new orchestrator tests:** `cd go && go test ./cmd/ingest-all/... -race`. Uses synthetic delays under 200 ms total.

- **Manual workflow dispatch on CI:** trigger `Ingest` from the GitHub Actions UI to validate the change against the real `ubuntu-latest` runner. Compare the `ingest-all: complete` line in the run log to the local 56.9 s figure.

---
✅ **CRISPY workflow complete.** All artifacts are in `docs/crispy/go-ingest-concurrency/`.
