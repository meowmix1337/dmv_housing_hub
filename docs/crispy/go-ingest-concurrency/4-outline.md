# Outline

Three vertical slices. Slice 1 lands logger plumbing that's also useful on its own. Slice 2 lands concurrency on top. Slice 3 captures the measurement that motivated the change. Each slice is mergeable independently and verifiable without the next.

## Slice 1 — Per-source logger attribution

**Goal:** Every `slog` record emitted by an individual ingester carries a structured `source="…"` attribute, so the existing serial output is searchable by source and future interleaved output stays attributable.

**Components:**

- `go/internal/ingest/datasource.go`: extend the `DataSource` interface (or add a sibling interface) with an optional `WithLogger(*slog.Logger) DataSource` method, or a concrete `SetLogger` setter on each `*Source`. Picking one style is a Slice 1 design call; design favours a setter on each `*Source` to keep `DataSource` minimal.
- `go/internal/ingest/{fred,census,bls,qcew,zillow,redfin}/*.go`: each `*Source` adds `SetLogger(*slog.Logger)` writing to its existing `logger` field. No call-site changes inside `Fetch`; existing log lines pick up the attribute automatically.
- `go/cmd/ingest-all/main.go`: in `runOne`, before `src.Fetch(ctx)`, build `srcLogger := logger.With("source", src.Name())` and call `src.SetLogger(srcLogger)` if the source supports it (type-assert via a small local interface).
- `go/internal/log/log.go`: no change expected; verify the default handler propagates `With` attributes (standard `slog` behaviour).

**Checkpoint:**

- Existing per-package unit tests pass unchanged.
- A short manual run of `go run ./cmd/ingest-fred` (or any single ingester) shows the `source` attribute on every per-series log line — grep `source=fred` returns all FRED log records.
- `make test` and `make lint` clean.

## Slice 2 — Concurrent fan-out in `cmd/ingest-all`

**Goal:** `cmd/ingest-all` runs all six `DataSource.Fetch` calls concurrently while preserving the existing "every source runs, exit 1 if any failed" policy, byte-equivalent `.cache/*.json` outputs, and SIGINT propagation.

**Components:**

- `go/cmd/ingest-all/main.go`: replace the serial loop with an `errgroup.Group` created via `errgroup.WithContext(ctx)`. Each goroutine wraps `runOne(ctx, src, srcLogger)` and:
  - on `nil` error, returns `nil`;
  - on non-nil error, takes a `sync.Mutex`, appends to `errs []error`, returns `nil` (so siblings continue).
  - SIGINT cancels `ctx`; goroutines observe via `req.WithContext(ctx)` inside the HTTP client.
- Replace the final terminal log with `Info("ingest-all: complete", "totalDurationMs", …, "failed", len(errs), "sources", len(sources))`. Add `Info("ingest-all: started", "sources", len(sources))` at the top of `main`.
- `go/cmd/ingest-all/main_test.go` (new): introduces 2–3 `fakeSource` types implementing `ingest.DataSource`. Cases:
  - all six succeed → zero `errs`, six cache files written, total durationMs ≈ max(per-source), not sum;
  - one fails → other five caches written, `errs` has one entry, process would exit 1 (assert via factored-out `run(ctx, …) int` returning exit code);
  - context cancel → `Fetch` calls observe cancellation; no panic; `errs` may contain context errors.
- `go.mod`: add `golang.org/x/sync` if not already pulled in; it is the only new dependency.

**Checkpoint:**

- `go test ./cmd/ingest-all/...` covers the three cases above and asserts max-not-sum wall-clock under fake delays.
- Live run: `make ingest` with real keys completes successfully; diff `.cache/*.json` against a prior serial-run snapshot via `jq -S '.observations | sort_by(.source, .series, .fips, .observedAt)'` — expect zero diff per source.
- GitHub Actions `Ingest` workflow run completes; commit step still operates the same way.
- `make typecheck`-equivalent (`go vet`, `golangci-lint`) clean.

## Slice 3 — Wall-clock measurement and verification gate

**Goal:** Capture the before/after speedup and the post-change combined-pipeline RSS, in a form that lives in the repo for future audits.

**Components:**

- `docs/crispy/go-ingest-concurrency/verification.md` (new, short): records the *baseline* total durationMs (read from a recent pre-merge serial GitHub Actions run, or one manual local serial run via a temporary `INGEST_SEQUENTIAL=1` toggle if added) and the *new* total durationMs (from the first concurrent run). Also records peak RSS measured locally via `/usr/bin/time -l ./ingest-all` on Darwin or `/usr/bin/time -v` on Linux.
- Optional: an `INGEST_SEQUENTIAL=1` envvar wired into `cmd/ingest-all` that falls back to the old serial loop, for the comparison run and as a permanent safety valve. This is one of the open questions in design; if rejected, the comparison uses git history (run the workflow on `main` for the baseline, on the feature branch for the new shape).
- Update to `docs/crispy/go-ingest-concurrency/2-research.md` Open Question Q4 (or a follow-up note in the verification file) recording the measured wall-clock.

**Checkpoint:**

- `verification.md` exists with three numbers: baseline durationMs, new durationMs, new peak RSS.
- Speedup is positive (sanity check; design predicts the new total is bounded below by Redfin's solo time).
- New peak RSS is under 1 GB (very loose ceiling vs. ubuntu-latest's 7 GB).

## Key Interfaces

### `ingest.DataSource` (existing, unchanged)

```go
type DataSource interface {
    Name() string
    Cadence() types.Cadence
    Fetch(ctx context.Context) ([]types.Observation, error)
}
```

This interface stays as-is to avoid a breaking change. Slice 1 introduces a *sibling* contract:

### `loggerSettable` (new, package-private in `cmd/ingest-all`)

```go
type loggerSettable interface {
    SetLogger(*slog.Logger)
}
```

`runOne` type-asserts each source against `loggerSettable` and injects the source-tagged logger. Sources that don't implement it keep the package-default logger — no breaking change for hypothetical out-of-tree consumers.

### `runOne` signature (existing, unchanged signature; reused inside goroutines)

```go
func runOne(ctx context.Context, src ingest.DataSource, logger logCapable) error
```

Slice 2 keeps this signature so `main_test.go` can drive it directly with fake sources. The orchestrator-level concurrency lives in `main`, not inside `runOne`.

### `cmd/ingest-all` exit-code path (new factoring for testability in Slice 2)

```go
func run(ctx context.Context, logger *slog.Logger, sources []ingest.DataSource) int
```

Pulls the existing `main` body into a testable function returning an exit code; `main` becomes a four-line shim. Lets `main_test.go` assert the exit-1-on-any-failure policy without spawning a subprocess.

## Next
**Phase:** Plan
**Artifact to review:** `docs/crispy/go-ingest-concurrency/4-outline.md`
**Action:** Review the vertical slices and checkpoints. Then invoke `crispy-plan` with project name `go-ingest-concurrency`.
