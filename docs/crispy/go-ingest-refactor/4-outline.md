# Outline

Eight vertical slices. Each slice is end-to-end (runs a real command, produces a real artifact, has a verifiable checkpoint). Earlier slices establish the data path with the simplest source (FRED); later slices add the other five sources and orchestration; the final slice deletes `scripts/`.

## Slice 0 — Go workspace skeleton + foundation libraries

**Goal:** A `go/` module exists with `internal/types/`, `internal/log/`, `internal/http/`, `internal/storage/`, and a passing types-contract test. No ingester yet.

**Components:**
- `go/go.mod` declaring `go 1.26` (floor) and pulling in `github.com/avast/retry-go/v4`, `github.com/joho/godotenv`, `github.com/caarlos0/env/v11`.
- `go/internal/types/types.go` — hand-maintained Go structs mirroring `shared/src/types.ts`: `Observation`, `MetricId` (string const block), `Unit`, `Cadence`, `Jurisdiction`, `CountySummary`, `CountyCurrentSnapshot`, `CountySeries`, `MetricSeries`, `Manifest`, `ManifestSourceEntry`, `ActiveListingsDmv`, `FederalEmploymentDmv`, `MaybeFloat`.
- `go/internal/types/testdata/county_summary_golden.json` — one fixture sourced from a current `web/public/data/counties/{fips}.json`.
- `go/internal/types/types_contract_test.go` — load the golden, decode into `CountySummary`, re-encode, assert key-by-key equivalence (after re-sorting maps).
- `go/internal/log/log.go` — `slog.Logger` factory; JSON handler when stderr is not a TTY, text otherwise.
- `go/internal/http/client.go` — `New(opts) *Client` + `Client.Do(ctx, req) (*http.Response, error)` wrapping `retry-go/v4` with a `Retry-After` parser helper.
- `go/internal/http/client_test.go` — `httptest` test asserting 429 + `Retry-After: 2` waits ≥ 2 s then succeeds.
- `go/internal/storage/atomic.go` — `AtomicWrite(path string, data []byte) error` (CreateTemp in same dir, Rename).

**Checkpoint:** `cd go && go test ./...` passes. `go vet ./...` clean. `golangci-lint run ./...` clean.

## Slice 1 — FRED ingester end-to-end (single source)

**Goal:** `go run ./cmd/ingest-fred` fetches FRED observations and writes `go/.cache/fred.json` in a shape identical to today's `scripts/.cache/fred.json` for the same series set.

**Components:**
- `go/internal/ingest/datasource.go` — `type DataSource interface { Name() string; Cadence() types.Cadence; Fetch(ctx context.Context) ([]types.Observation, error) }`.
- `go/internal/ingest/fred/fred.go` — `New(cfg Config) DataSource` and `(*FRED).Fetch`. Uses `MaybeFloat` for `"."` sentinel parsing. Reads `FRED_API_KEY` via `caarlos0/env`.
- `go/internal/ingest/fred/fred_test.go` — table-driven `httptest` tests for happy path, `"."` sentinel, paginated response, 429 retry.
- `go/internal/ingest/fred/testdata/series_<id>.json` — recorded FRED response fixtures.
- `go/cmd/ingest-fred/main.go` — load `.env`, parse config, construct `FRED`, call `Fetch`, marshal to `.cache/fred.json` via `storage.AtomicWrite`.

**Checkpoint:** `npm run ingest:fred --workspace=scripts` and `go run ./go/cmd/ingest-fred` produce JSON files that are equal after `jq -S .` normalization (key ordering only) on a real API call.

## Slice 2 — Transform end-to-end with FRED only

**Goal:** `go run ./go/cmd/transform` reads the FRED cache + the bundled counties list and emits the FRED-relevant fields of `web/public/data/counties/{fips}.json`, plus `metrics/*.json` for FRED series, plus a partial `manifest.json` (FRED entry only).

**Components:**
- `go/internal/counties/counties.go` — bundled embed of the canonical DMV counties list (FIPS + name + jurisdiction), mirroring `scripts/lib/counties.ts`.
- `go/internal/transform/county_pages.go` — `BuildCountyPages(obs map[string][]types.Observation, counties []County) ([]types.CountySummary, error)`. FRED-only fields populated; others nil/zero.
- `go/internal/transform/manifest.go` — `BuildManifest(sources []SourceMeta) types.Manifest`.
- `go/internal/transform/county_pages_test.go` — golden test under `testdata/transform/golden/fred-only/` comparing produced JSON against expected.
- `go/cmd/transform/main.go` — load every cache file from `.cache/`, dispatch to transform, write outputs via `storage.AtomicWrite`.

**Checkpoint:** With `scripts/.cache/` populated by the TS pipeline and `go/.cache/fred.json` from Slice 1, run Go transform. `diff -r web/public/data/counties/` shows only fields that the TS transform also produces from non-FRED sources (verified by capturing those fields in a "fred-only" snapshot).

## Slice 3 — Census ACS ingester

**Goal:** `cmd/ingest-census` writes `go/.cache/census.json` identical to TS output.

**Components:**
- `go/internal/ingest/census/census.go` — handles ACS variables (B19013_001E, B25077_001E, B25064_001E), MOE parsing, `null` → skip.
- Tests + fixtures under `go/internal/ingest/census/testdata/`.
- `go/cmd/ingest-census/main.go`.

**Checkpoint:** `jq -S .` normalized diff between Go cache and TS cache is empty for the same API response.

## Slice 4 — BLS LAUS + QCEW ingesters

**Goal:** `cmd/ingest-bls` and `cmd/ingest-qcew` write caches identical to TS output. The BLS branch filters `M01–M12` (excludes `M13`); QCEW filters by NAICS code for federal employment.

**Components:**
- `go/internal/ingest/bls/bls.go` — POST API, up to 50 series per call, retry on 429.
- `go/internal/ingest/qcew/qcew.go` — single-file annual download, NAICS filter, county FIPS resolution.
- `go/cmd/ingest-bls/main.go`, `go/cmd/ingest-qcew/main.go`.
- Tests + recorded fixtures per source.

**Checkpoint:** Per-source `jq -S .` diff against TS output is empty.

## Slice 5 — Zillow + Redfin ingesters

**Goal:** `cmd/ingest-zillow` and `cmd/ingest-redfin` write caches identical to TS output. Zillow wide→long transpose; Redfin streamed TSV with DC/MD/VA filter on parse.

**Components:**
- `go/internal/ingest/zillow/zillow.go` — `encoding/csv` reader for wide format, name→FIPS lookup via `internal/counties`, transpose to `[]Observation`.
- `go/internal/ingest/redfin/redfin.go` — `bufio.Scanner` with 32 MB buffer, `strings.Split('\t')`, filter `state_code IN ('DC','MD','VA')` before allocation.
- `go/cmd/ingest-zillow/main.go`, `go/cmd/ingest-redfin/main.go`.
- Tests with downsampled fixtures (Redfin fixture is hand-crafted with 100 representative rows + edge cases).

**Checkpoint:** Per-source `jq -S .` diff against TS output is empty. Redfin run on the full ~7 M-row file stays under 256 MB RSS (verified with `/usr/bin/time -v`).

## Slice 6 — Full transform, DMV aggregates, affordability, market health

**Goal:** `cmd/transform` now populates all `CountySummary` fields, all `metrics/*.json` series, `manifest.json` for all six sources, and the DMV aggregates `web/public/data/dmv/active-listings.json` + `web/public/data/dmv/federal-employment.json`.

**Components:**
- `go/internal/transform/affordability.go` — NAR HAI formula port from `scripts/transform/affordability.ts`.
- `go/internal/transform/market_health.go` — port from `scripts/transform/marketHealth.ts`.
- `go/internal/transform/dmv.go` — `ActiveListingsDmv` and `FederalEmploymentDmv` builders.
- Extended `BuildCountyPages` to join across all six caches.
- `go/internal/transform/build_all_test.go` — full golden under `testdata/transform/golden/full/` with one fixture per county.

**Checkpoint:** With all six caches populated, `go run ./go/cmd/transform` produces `web/public/data/` byte-equal to the TS pipeline's output (after `jq -S .` key normalization on every JSON file). This is the milestone before cutover.

## Slice 7 — `ingest-all`, `check-bundle-size`, root Makefile

**Goal:** One command runs every ingester. The bundle-size check is ported. A root `Makefile` provides `make ingest`, `make transform`, `make web`, `make check-bundle-size`.

**Components:**
- `go/cmd/ingest-all/main.go` — sequential dispatch with structured error aggregation (one failure does not skip later sources).
- `go/cmd/check-bundle-size/main.go` — port of `scripts/check-bundle-size.ts`; walks `web/dist/`, sums file sizes, fails if over budget.
- Root `Makefile` with the four targets above plus `make test` (runs `go test ./...` and existing `npm test`).

**Checkpoint:** `make ingest && make transform` from a clean tree produces the same `web/public/data/` as the TS pipeline. `make check-bundle-size` exits 0 on the current build and exits 1 when budget is artificially lowered in a test.

## Slice 8 — CI cutover, delete `scripts/`, docs

**Goal:** `.github/workflows/ingest.yml` uses Go. `scripts/` is removed. `package.json` workspaces drops `scripts`. `CLAUDE.md`, `ARCHITECTURE.md`, `PROJECT_SPEC.md`, `DATA_SOURCES.md` updated to reference Go commands.

**Components:**
- Updated `.github/workflows/ingest.yml` — `actions/setup-go@v6` with `go-version: '1.26'`, default cache; replaces npm steps; same cron, same concurrency group, same commit message (`data: monthly refresh`), same `INGEST_PUSH_TOKEN`.
- Deletion of `scripts/`, removal from root `package.json` workspaces array.
- Updated docs: command snippets in `CLAUDE.md`'s Commands section, ingester pattern reference in `DATA_SOURCES.md`, the Node-specific bits of `ARCHITECTURE.md` flipped to Go.
- New `go/README.md` covering local dev (`make ingest`, `.env` setup).

**Checkpoint:** Push branch; CI green. `gh workflow run ingest` manual dispatch completes successfully and produces a no-op commit (since underlying upstream data is unchanged between TS and Go runs).

## Key Interfaces

```go
// internal/types: contract with shared/src/types.ts. Hand-maintained; round-trip
// contract test in Slice 0 guards drift.
type Observation struct {
    Source     string  `json:"source"`
    Series     string  `json:"series"`
    FIPS       string  `json:"fips"`
    Metric     MetricId `json:"metric"`
    ObservedAt string  `json:"observedAt"`
    Value      float64 `json:"value"`
    Unit       Unit    `json:"unit"`
    MOE        *float64 `json:"moe,omitempty"`
}

type MaybeFloat struct {
    Val   float64
    Valid bool
}
// (*MaybeFloat).UnmarshalJSON handles numeric, null, and the FRED "." sentinel.

// internal/ingest: every ingester implements this. cmd/ingest-* wraps one impl.
type DataSource interface {
    Name() string
    Cadence() types.Cadence
    Fetch(ctx context.Context) ([]types.Observation, error)
}

// internal/http: retry + Retry-After. All ingesters share one client.
type Client struct{ /* retry-go config, default headers */ }
func (c *Client) Do(ctx context.Context, req *http.Request) (*http.Response, error)

// internal/storage: atomic file writes. All cache + output writes go through here.
func AtomicWrite(path string, data []byte) error

// internal/transform: pure functions from caches → outputs.
func BuildCountyPages(
    obs map[string][]types.Observation,
    counties []counties.County,
) ([]types.CountySummary, error)

func BuildManifest(sources []SourceMeta) types.Manifest
```

## Next
**Phase:** Plan
**Artifact to review:** `docs/crispy/go-ingest-refactor/4-outline.md`
**Action:** Review the vertical slices and checkpoints. Then invoke `crispy-plan` with project name `go-ingest-refactor`.
