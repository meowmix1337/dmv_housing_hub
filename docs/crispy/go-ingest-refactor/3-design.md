# Design

## Current State

- `scripts/` is a Node.js + TypeScript workspace (~3,800 LOC) with three sub-trees: `ingest/` (six sources — fred, census, bls, qcew, zillow, redfin — plus `run.ts` and `DataSource.ts`), `transform/` (`build-county-pages.ts` is ~600 lines and emits per-county JSON, plus `affordability.ts` and `marketHealth.ts`), and `lib/` (`http.ts`, `storage.ts`, `log.ts`, `counties.ts`, `errors.ts`, `verification.ts`, etc.).
- Each ingester implements `DataSource { name, cadence, fetch(): Promise<Observation[]> }`. The shared `Observation`, `MetricId`, `CountySummary`, `Manifest`, etc. live in `shared/src/types.ts` and are imported by both `scripts/` and `web/` via `@dmv/shared`.
- HTTP is funneled through `scripts/lib/http.ts` (`fetchWithRetry` — retries, exponential backoff, `Retry-After` parsing). File writes go through `scripts/lib/storage.ts` (temp-then-rename). Logging is Pino. Env vars are loaded by `dotenv`.
- GitHub Actions cron (`.github/workflows/ingest.yml`) runs on the 5th of each month: `actions/setup-node@v4` → `npm ci` → `npm run ingest --workspace=scripts -- --all` → `npm run transform` → commit `web/public/data/`.
- Test stack: vitest, with `*.test.ts` co-located. `scripts/transform/build-county-pages.test.ts` is the main golden-style suite.
- Hard constraints (`ARCHITECTURE.md`): no runtime backend, no database, no Docker, no paid services. Only the ingest+transform job runs server-side, and only at build time.

## Desired End State

- A `go/` workspace replaces `scripts/` for ingestion and transform. Same six ingesters, same `Observation` semantics, same per-source quirks (FRED `"."` sentinel, BLS `M01–M12` filter, Zillow wide-to-long transpose, Redfin DMV-only TSV filter, etc.).
- One `go.mod` at `go/` with `go 1.26` (floor, not pinned patch) and single module path. Commands live under `go/cmd/`: `ingest-fred`, `ingest-census`, `ingest-bls`, `ingest-qcew`, `ingest-zillow`, `ingest-redfin`, `ingest-all`, `transform`, `check-bundle-size`. Shared code lives under `go/internal/`.
- The cutover is a single PR: `scripts/` is removed and `go/` is added in the same commit set. Outputs in `web/public/data/` must be byte-equivalent before merge — verified by running both pipelines locally and diffing.
- Outputs are byte-for-key-equivalent to the current TS pipeline: `web/public/data/counties/{fips}.json`, `web/public/data/metrics/*.json`, `web/public/data/manifest.json`. The web SPA is **not** modified.
- The shared TS types in `shared/src/types.ts` remain the contract. The Go side generates its structs (and supporting tooling) from those types, so the SPA continues to consume the same JSON shapes without coordination.
- `.github/workflows/ingest.yml` swaps `setup-node` + `npm` steps for `actions/setup-go@v6` + `go run ./cmd/...` while keeping the cron, commit message (`data: monthly refresh`), and concurrency group.

## Architecture Decisions

### Workspace location: `go/` sibling, not nested

**Decision:** A new top-level `go/` directory with its own `go.mod`. The existing `scripts/` directory is removed in the final cutover commit (not deleted incrementally).

**Why:** Aligns with `go.dev/doc/modules/layout` for single-module repos; avoids `go.work` complexity the official docs discourage in CI; cleanly separates Go's build cache from `node_modules`; keeps `npm install` from accidentally walking Go source.

**Trade-off:** A polyglot repo (Go + TS) without a unifying build tool means root-level `Makefile` or shell scripts coordinate cross-toolchain steps. Acceptable given the workflow is mostly two sequential pipelines (Go → JSON → React build), not an interleaved graph.

### CLI layout: per-source `cmd/`, shared `internal/`

**Decision:** Each ingester ships as its own binary under `cmd/ingest-<source>/main.go`, plus `cmd/ingest-all/` and `cmd/transform/`. All implementation lives under `internal/` (sources, http, storage, log, counties, transform).

**Why:** Direct mirror of today's per-source `npm run ingest:fred` UX; debugging a single source in isolation is the most common dev task. `internal/` prevents external consumers from depending on these packages and gives free refactoring license.

**Trade-off:** N+2 binaries to build vs. one `dmv` multi-command CLI. Bigger CI build matrix surface, but `go build ./...` handles them in one step.

### TS → Go type sharing: hand-maintained `types.go` + round-trip contract test

**Decision:** Treat `shared/src/types.ts` as the source of truth. Hand-maintain `go/internal/types/types.go` with the equivalent Go structs. A contract test under `go/internal/types/types_contract_test.go` loads a representative `CountySummary` golden JSON, decodes it into the Go struct, re-encodes it, and asserts byte-equivalence with the original (modulo key ordering). The same golden is consumed by a vitest in `shared/` to assert the TS side parses it cleanly.

**Why:** No codegen tool produces idiomatic Go from TS discriminated unions (e.g., `MetricId`) and optional fields cleanly. Hand-maintenance is a one-time cost — the type set is closed and small (~15 interfaces). The contract test catches drift in CI without depending on flaky codegen.

**Trade-off:** Both files must be edited together when a new metric or field is added. Mitigated by the contract test failing loudly in CI on drift, and by the small surface area (one PR touches one type file on each side).

### HTTP retry: `avast/retry-go` + manual `Retry-After`

**Decision:** Use `github.com/avast/retry-go/v4` for the retry loop. Implement `Retry-After` parsing in a small helper inside `internal/http/` that returns a `retry.Delay` function reading the header off the most recent response.

**Why:** User-selected. Library handles exponential backoff + jitter idiomatically; the missing `Retry-After` parse is ~15 lines of stdlib code (`strconv.Atoi` + `http.ParseTime`) — same shape as today's `parseRetryAfter` in `scripts/lib/http.ts`.

**Trade-off:** Slightly more glue code than `hashicorp/go-retryablehttp` (which parses `Retry-After` natively). Accepted in exchange for user preference and a smaller dep surface (retry-go has zero transitive deps).

### Logging: `log/slog` (stdlib)

**Decision:** Use `log/slog` with the JSON handler in CI and the text handler when stderr is a TTY.

**Why:** Stable since Go 1.21; structured KV API matches today's Pino usage; zero external dep; lets future code adopt zap or zerolog via `slog.Handler` without touching call sites.

**Trade-off:** Slower than zerolog/zap in microbenchmarks. Irrelevant for a monthly ingest job dominated by network I/O.

### JSON: `encoding/json` (stdlib v1) with `Decoder.DisallowUnknownFields`

**Decision:** Use stdlib `encoding/json`. Decoders strict-by-default for upstream responses. Defer `encoding/json/v2` until it graduates from `GOEXPERIMENT`.

**Why:** v2 is still experimental in Go 1.26 (no graduation in 1.26 release notes). Production data pipelines should not depend on `GOEXPERIMENT` gates. Strict decoding catches upstream contract drift in CI.

**Trade-off:** Some performance and ergonomics improvements deferred. Revisit when v2 graduates (likely 1.27 or later).

### Nullable numerics: custom `UnmarshalJSON` wrapper

**Decision:** Define `internal/types/MaybeFloat { Val float64; Valid bool }` with `UnmarshalJSON` that accepts numeric JSON, `null`, and the FRED `"."` sentinel string. All FRED observation parsing uses this type.

**Why:** Cleanest stdlib-only handling of the FRED sentinel; mirrors `sql.NullFloat64` semantics but adds JSON support; isolates the sentinel knowledge to one type.

**Trade-off:** One extra type per nullable column; downstream code reads `.Valid` instead of native `float64`. Acceptable — most observations are valid; invalid ones are dropped at transform time today anyway.

### Atomic file writes: stdlib `os.CreateTemp` + `os.Rename`

**Decision:** Implement `internal/storage/AtomicWrite(path string, data []byte)` using `os.CreateTemp(dir, ".tmp-*")` in the **same directory** as the target, then `os.Rename`. No `google/renameio` dependency.

**Why:** Stdlib is sufficient on the POSIX-only GitHub Actions runners. Avoids the renameio's Windows-not-supported caveat (which doesn't affect this project but adds an unused dep).

**Trade-off:** No cross-filesystem helpers; if someone later runs ingest on Windows for local debugging, atomic rename guarantees weaken. Documented in code comment.

### Streaming Redfin TSV: `bufio.Scanner` with raised buffer

**Decision:** Read Redfin TSV line-by-line with `bufio.Scanner` and a 32 MB max-token buffer (`scanner.Buffer(make([]byte, 1<<20), 32<<20)`). Filter `state_code IN ('DC','MD','VA')` immediately on parse. Do not use `encoding/csv` for this file.

**Why:** Today's TS code mirrors this — filter early, never materialize the full file. `bufio.Scanner` avoids the `encoding/csv` `LazyQuotes` buffering footgun ([golang/go#8059](https://github.com/golang/go/issues/8059)) and is faster for predictable-width fields.

**Trade-off:** Loses CSV's quote handling. Redfin's published data is tab-separated without embedded tabs in quoted fields; if that changes, switch to `encoding/csv` with explicit `Comma='\t'`.

### Env vars: `joho/godotenv` + `caarlos0/env/v11`

**Decision:** Each `cmd/*` calls `_ = godotenv.Load()` early, then `env.Parse(&cfg)` where `cfg` is a struct with `env:"FRED_API_KEY,required"` tags.

**Why:** Direct equivalent of today's Node.js `dotenv` + manual `process.env` reads. Struct binding centralizes validation (one error message per missing required var). Both libs are actively maintained.

**Trade-off:** Two deps where one would do (`os.LookupEnv` alone is fine). Accepted for the better error reporting at startup.

### Testing: `httptest` + golden files in `testdata/`

**Decision:** All HTTP tests use `httptest.NewServer` with handlers that return canned upstream payloads stored under `testdata/<source>/`. Transform tests compare generated JSON against goldens under `testdata/transform/golden/<fips>.json` using a small `assertGolden(t, got, path)` helper that supports `go test -update`.

**Why:** Matches today's vitest fixtures pattern; no third-party dependency needed; stdlib is enough. `httptest` and golden files are the documented Go idiom.

**Trade-off:** No recorded-cassette replay (`go-vcr`) for live API testing. Acceptable — today's TS tests don't do that either.

### CI: `actions/setup-go@v6`, built-in cache, run `go run ./cmd/...`

**Decision:** Swap `actions/setup-node@v4` + `npm` steps for `actions/setup-go@v6` with `go-version: '1.26'`, default cache on. Keep the same checkout, env, commit, and concurrency group. `npm run transform` becomes `go run ./go/cmd/transform`.

**Why:** Per user input, pin major version `v6` so patches roll in. Built-in cache covers `~/go/pkg/mod` and `~/.cache/go-build` keyed on `go.sum` — no manual `actions/cache` step needed.

**Trade-off:** Cache key is keyed off `go.sum`; if a contributor adds a `// indirect` dep that doesn't update `go.sum`, cache stays warm with stale state. Low risk for a single-purpose ingest module.

## Patterns to Follow

**Mirror, don't reinvent:**
- One ingester per source file, implementing a single `DataSource` interface — keep the 1:1 mapping with today's `scripts/ingest/*.ts`.
- `run.ts`'s `--all` flag → `cmd/ingest-all/` that imports each source's `New<Source>()` and calls them sequentially with structured error aggregation.
- Same env var names (`FRED_API_KEY`, `CENSUS_API_KEY`, `BLS_API_KEY`).
- Same cache directory (`scripts/.cache/` → `go/.cache/` in gitignore) and same on-disk format per source.

**Reject:**
- **`go.work` / multi-module layouts.** Single module is simpler and matches official guidance.
- **`spf13/viper`** for config. Env-only is sufficient; viper's dep weight isn't justified.
- **`golang-standards/project-layout`** as a literal blueprint. It's not official; we follow `go.dev/doc/modules/layout` instead.
- **Bazel/Turborepo** as a cross-toolchain build tool. A root `Makefile` with `make ingest`, `make transform`, `make web` is enough.
- **`gocarina/gocsv` for Redfin.** Reflection-based, non-streaming by default; the data is too large.

## Open Questions

None. All resolved during design review (2026-05-10):

- **TS→Go type sharing** → hand-maintained `go/internal/types/types.go` with a round-trip contract test (see Architecture Decisions).
- **Cutover** → single PR; `scripts/` is removed and `go/` is added in the same commit set; output byte-equivalence verified before merge.
- **`check-bundle-size.ts`** → port to Go as `go/cmd/check-bundle-size/`.
- **`go.mod` version** → floor (`go 1.26`); toolchain auto-resolves patches.

## Research gaps that affect design

- **No controlled Go vs. npm cache benchmark on identical hardware** (from research Q18). Doesn't block the design; means we can't quote a specific CI speedup number in PR descriptions.

## Next
**Phase:** Outline
**Artifact to review:** `docs/crispy/go-ingest-refactor/3-design.md`
**Action:** Review decisions and open questions. Then invoke `crispy-outline` with project name `go-ingest-refactor`.
