# Plan

Tactical execution plan for the nine slices in `4-outline.md`. Each step lists files, commands, and verification. Where deviations from the design are needed, they are called out inline with rationale.

**Conventions used throughout:**
- Module path: `github.com/meowmix1337/dmv_housing_hub/go`.
- Working directory for all `go` commands: `go/`. CI runs commands from repo root with `-C go` or `./go/cmd/...` paths as noted.
- Per slice, one commit (or a small commit train) on the `feat/go-ingest-refactor` branch. Do not merge until Slice 8.
- Every new Go file gets `golangci-lint run` and `go vet` clean before commit.
- **API keys for verification gates:** `FRED_API_KEY`, `CENSUS_API_KEY`, `BLS_API_KEY` live in the repo-root `.env` file. Go commands load them via `godotenv.Load("../.env", ".env")`; TS scripts use `dotenv/config`. Do **not** read/source `.env` directly — just run the command and let the loaders pick it up.

---

## Slice 0 — Go workspace skeleton + foundation libraries

### Steps

1. **Initialize module.**
   ```bash
   mkdir -p go && cd go
   go mod init github.com/meowmix1337/dmv_housing_hub/go
   ```
   Edit `go.mod` so the first non-module line is exactly `go 1.26` (no patch). Add `.gitignore` at `go/.gitignore` with `.cache/` and `*.tmp-*`.

2. **Add deps (pin via `go get`; let `go.sum` lock):**
   ```bash
   go get github.com/avast/retry-go/v4
   go get github.com/joho/godotenv
   go get github.com/caarlos0/env/v11
   ```

3. **Create `go/internal/types/types.go`** — hand-mirror `shared/src/types.ts`. Concrete entries (signatures only — field names follow Go conventions but JSON tags reproduce TS keys exactly):
   - `type Cadence string` with consts `CadenceDaily`, `CadenceWeekly`, `CadenceMonthly`, `CadenceQuarterly`, `CadenceAnnual`.
   - `type Jurisdiction string` with consts `JurisdictionDC`, `JurisdictionMD`, `JurisdictionVA`.
   - `type MetricId string` with one const per TS union member. Define a `func (MetricId) Valid() bool` returning `true` for known IDs (used by the contract test).
   - `type Unit string` with consts mirroring the TS union.
   - `Observation`, `MetricPoint`, `MetricSeries`, `CountyForecast`, `CountyCurrentSnapshot` (all optional fields as pointers — `*float64`, `*string` — to round-trip TS `undefined`).
   - `ActiveListingsByType`, `ActiveListingsBreakdown`, `CountySeries`, `CountySummary`, `ManifestSourceEntry`, `Manifest`, `ActiveListingsDmv`, `FederalEmploymentDmv`.
   - `MaybeFloat` and its `UnmarshalJSON` accepting numeric, `null`, and string-encoded numbers including the `"."` sentinel. **MarshalJSON also required**: emit `null` when `!Valid`, otherwise emit the numeric value. Without this, encoding round-trips will drop the sentinel field as `{"Val":0,"Valid":false}`.

   **Deviation from design (minor):** `MaybeFloat` needs a `MarshalJSON` too — design only specified `UnmarshalJSON`. Required for the round-trip contract test. Documented in code.

4. **Source the contract golden.** Pick the smallest current county file:
   ```bash
   ls -lS web/public/data/counties/*.json | tail -3
   ```
   Copy that file to `go/internal/types/testdata/county_summary_golden.json`. Re-run with `jq -S .` to produce a stable key-sorted version saved alongside as `county_summary_golden.sorted.json`.

5. **Write `go/internal/types/types_contract_test.go`:**
   - `TestCountySummaryRoundTrip` — read `county_summary_golden.sorted.json`, `json.NewDecoder().DisallowUnknownFields().Decode()` into `CountySummary`, re-encode with `json.MarshalIndent`, normalize via `json.Marshal(map[string]any)` + `jq -S` shape (sort keys recursively in Go using a small helper), `bytes.Equal` against the original.
   - `TestMetricIdValid` — every const passes `Valid()`; unknown strings fail.
   - `TestMaybeFloatRoundTrip` — table-driven: `"."`, `null`, `3.14`, `"3.14"`, all round-trip via `json.Marshal(json.Unmarshal(...))`.

6. **Write `go/internal/log/log.go`:**
   ```go
   package log
   func New() *slog.Logger // JSON handler if !isatty(stderr) else text handler
   func Default() *slog.Logger // memoized New()
   ```
   Use `golang.org/x/term.IsTerminal(int(os.Stderr.Fd()))` for TTY detection. Add `golang.org/x/term` via `go get`.

7. **Write `go/internal/http/client.go`:**
   ```go
   type Options struct {
       Timeout    time.Duration // default 30s
       MaxRetries uint          // default 3
       UserAgent  string        // default "dmv-housing-app/0.1 (+https://github.com/meowmix1337/dmv_housing_hub)"
   }
   type Client struct { /* unexported */ }
   func New(opts Options) *Client
   func (c *Client) Do(ctx context.Context, req *http.Request) (*http.Response, error)
   func (c *Client) GetJSON(ctx context.Context, url string, label string, out any) error
   func (c *Client) GetText(ctx context.Context, url string, label string) (string, error)
   func (c *Client) GetBytes(ctx context.Context, url string, label string) ([]byte, error)
   ```
   Implementation uses `retry.Do(...)` with `retry.DelayType(custom)` where `custom` inspects the most recent response's `Retry-After` (numeric seconds or HTTP date) via a closure that captures the last `*http.Response`. Non-retryable: any 4xx except 408 and 429. Wrap errors with a typed `*HTTPError { Status int; URL string; BodyExcerpt string }`.

8. **Write `go/internal/http/client_test.go`:**
   - `TestRetryAfterHonored` — `httptest.NewServer` returns 429 + `Retry-After: 1` once, then 200. Assert elapsed ≥ 1 s and final body is correct.
   - `TestNonRetryable4xx` — server returns 404; `Do` returns immediately with `*HTTPError`, no retries.
   - `TestRetryOn5xx` — three 500s then 200; expect 200.

9. **Write `go/internal/storage/atomic.go`:**
   ```go
   func AtomicWrite(path string, data []byte) error
   func WriteJSON(path string, v any) error // calls json.MarshalIndent("", "  ") + AtomicWrite
   ```
   Use `os.CreateTemp(filepath.Dir(path), ".tmp-*")`, write, `f.Close()`, `os.Rename(tmpPath, path)`. On error, `os.Remove(tmpPath)`.

10. **Write `go/internal/storage/atomic_test.go`:** happy path, target-dir-missing returns wrapped error, partial write does not clobber existing file (use a write that fails mid-stream via a `bytes.Buffer` wrapper — actually simpler: write to a non-existent dir and confirm original target still exists).

### Verification (Slice 0 checkpoint)

```bash
cd go
go vet ./...
go test ./...
# install golangci-lint v2 latest if not present
golangci-lint run ./...
```

All three must exit 0.

### Commit
`feat(go): bootstrap Go workspace, types contract, http+storage+log foundations`

---

## Slice 1 — FRED ingester end-to-end

### Steps

1. **`go/internal/ingest/datasource.go`:**
   ```go
   type DataSource interface {
       Name() string
       Cadence() types.Cadence
       Fetch(ctx context.Context) ([]types.Observation, error)
   }
   ```

2. **`go/internal/counties/counties.go`** (needed early for FRED county series): port `DMV_COUNTIES` from `scripts/lib/counties.ts`. Use `//go:embed counties.json` if we want a single source-of-truth file; otherwise hand-port the slice literal. **Recommendation: hand-port.** Static, tiny, and changes ~never. Provide `func All() []County` and `func ByName(name string) (County, bool)`. Include a test that asserts length matches the TS list.

3. **`go/internal/ingest/fred/fred.go`** — direct port of `scripts/ingest/fred.ts`:
   - `type Config struct { APIKey string \`env:"FRED_API_KEY,required"\` }`
   - `type seriesSpec struct { id string; idFn func(fips string) string; metric types.MetricId; unit types.Unit; scope scope }`
   - National + state + county series lists exactly as in TS (same order).
   - `STATE_SERIES_TO_FIPS` map matches TS.
   - `Fetch` loop mirrors TS: national → state → county, with `time.Sleep(600*time.Millisecond)` between county calls to stay under FRED's 120 req/min (mirrors TS sleep).
   - On per-series error: `log.Warn(...)`, continue. Matches TS behavior — does NOT abort.
   - FRED response decoded into `struct { Observations []struct { Date string; Value MaybeFloat } }`. Skip `!o.Value.Valid` entries.

4. **`go/internal/ingest/fred/fred_test.go`:**
   - Fixture files: `testdata/series_MORTGAGE30US.json` (real curl output, trimmed to ~10 observations including one `"."` value), `testdata/series_ATNHPIUS11001A.json` (DC), `testdata/series_429_then_ok.json` for retry test.
   - `httptest.NewServer` routes by query `series_id` to fixture.
   - Assert: observation count, `Source == "fred"`, `Series == "MORTGAGE30US"`, `FIPS == "USA"`, sentinel rows skipped, `Unit` per spec.

5. **`go/cmd/ingest-fred/main.go`:**
   ```go
   func main() {
       _ = godotenv.Load("../.env", ".env") // try both locations
       var cfg fred.Config
       if err := env.Parse(&cfg); err != nil { log.Fatal(...) }
       ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
       defer cancel()
       src := fred.New(cfg, http.New(http.Options{}))
       obs, err := src.Fetch(ctx)
       if err != nil { /* log.Fatal */ }
       if err := storage.WriteJSON(".cache/fred.json", obs); err != nil { /* fatal */ }
   }
   ```
   Output JSON shape: a top-level array of `Observation`, matching today's `scripts/.cache/fred.json`.

   **Verify the cache shape before coding.** Run `jq 'type, .[0]' scripts/.cache/fred.json` if a fresh cache exists; otherwise inspect `scripts/ingest/run.ts` to confirm shape. **Deviation TBD**: if TS wraps observations in `{ "observations": [...] }`, mirror that wrapper; do not change the shape.

### Verification (Slice 1 checkpoint)

```bash
# Generate TS cache for comparison
FRED_API_KEY=$FRED_API_KEY npm run ingest:fred --workspace=scripts

# Generate Go cache
cd go && go run ./cmd/ingest-fred

# Diff after normalization
diff <(jq -S . ../scripts/.cache/fred.json) <(jq -S . .cache/fred.json)
```

Expected: empty diff. Tolerable difference: observation array order, if both pipelines guarantee deterministic order per series. If order diverges, sort both by `(fips, series, observedAt)` before diff and confirm equivalence.

### Commit
`feat(go): FRED ingester end-to-end`

---

## Slice 2 — Transform end-to-end with FRED only

### Steps

1. **`go/internal/transform/county_pages.go`:**
   ```go
   func BuildCountyPages(
       obs map[string][]types.Observation, // key: source name
       cs []counties.County,
   ) ([]types.CountySummary, error)
   ```
   For each county, populate `CountySummary{ FIPS, Name, Jurisdiction, LastUpdated: time.Now().UTC().Format(time.RFC3339) }`. Populate `Series.FhfaHpi` from FRED observations with `Metric == fhfa_hpi` AND `FIPS == county.FIPS`. Compute `Current.MarketHealthScore` only if non-FRED inputs are present (Slice 6); leave nil here.

2. **`go/internal/transform/manifest.go`:**
   ```go
   type SourceMeta struct { Name string; Cadence types.Cadence; LastUpdated string; Status string }
   func BuildManifest(sources []SourceMeta) types.Manifest
   ```
   Mirror TS shape: `{ generatedAt, sources: [{ name, lastUpdated, cadence, status, lastVerified? }] }`.

3. **`go/internal/transform/county_pages_test.go`:**
   - Fixture: `testdata/golden/fred-only/county_11001.json` — captured by running today's TS transform with only the FRED cache populated, against current data, and saving the output. Document in the file header how it was produced.
   - Test loads a fixture FRED observation slice, runs `BuildCountyPages`, marshals each result to JSON, and compares against the golden via a small `assertJSONEqual(t, got, goldenPath)` helper that does `json.Compact` on both sides plus `-update` flag support.

4. **`go/cmd/transform/main.go`:**
   - Walk `.cache/*.json`, load each into `[]types.Observation`, key by file stem (source name).
   - Load counties via `counties.All()`.
   - Call `BuildCountyPages`, write each result to `../web/public/data/counties/{fips}.json` via `storage.WriteJSON`.
   - Write a partial `manifest.json` with one entry (FRED) for now.

### Verification (Slice 2 checkpoint)

```bash
# Run TS transform with only FRED cache (clear other caches first to a tmp dir)
mv scripts/.cache/{census,bls,qcew,zillow,redfin}.json /tmp/ 2>/dev/null
npm run transform --workspace=scripts
cp -r web/public/data /tmp/ts-fred-only

# Restore
mv /tmp/{census,bls,qcew,zillow,redfin}.json scripts/.cache/ 2>/dev/null

# Run Go transform with same FRED-only cache
mkdir -p go/.cache && cp scripts/.cache/fred.json go/.cache/
cd go && go run ./cmd/transform

# Diff FRED-relevant fields only
for f in /tmp/ts-fred-only/counties/*.json; do
  fips=$(basename "$f" .json)
  diff <(jq -S '.series.fhfaHpi // empty' "$f") \
       <(jq -S '.series.fhfaHpi // empty' "../web/public/data/counties/$fips.json")
done
```

Expected: empty diff on the `series.fhfaHpi` and FRED-mortgage fields. Other fields will differ (TS produced them from other caches that we kept; Go didn't because the test isolated FRED). That's expected and not a failure for this slice.

### Commit
`feat(go): transform end-to-end with FRED-only output`

---

## Slice 3 — Census ACS ingester

### Steps

1. **`go/internal/ingest/census/census.go`** — port of `scripts/ingest/census.ts`:
   - Config: `CENSUS_API_KEY` via `caarlos0/env`.
   - Variables: `B19013_001E` (median household income), `B25077_001E` (median home value), `B25064_001E` (median gross rent). Match TS variable list exactly — read `scripts/ingest/census.ts` for the canonical list.
   - Request shape per TS: `https://api.census.gov/data/{year}/acs/acs5?get={var}M,{var}&for=county:*&in=state:11,24,51&key={key}`.
   - Response is a 2-D array: first row is headers, rest are rows. Decode as `[][]string`.
   - MOE handling: variables ending in `M` are margins of error; pair with their base variable and emit `MOE *float64` field.

2. **`testdata/acs5_2023.json`** — recorded response from real API call.

3. **`go/internal/ingest/census/census_test.go`** — table-driven over fixture; assert FIPS construction (state + county), `Source == "census"`, MOE attached.

4. **`go/cmd/ingest-census/main.go`** — same shape as `ingest-fred`.

### Verification

```bash
CENSUS_API_KEY=$KEY npm run ingest:census --workspace=scripts
cd go && go run ./cmd/ingest-census
diff <(jq -S . ../scripts/.cache/census.json) <(jq -S . .cache/census.json)
```

Empty diff (or sort-by-key-then-diff if order is non-deterministic).

### Commit
`feat(go): Census ACS ingester`

---

## Slice 4 — BLS LAUS + QCEW ingesters

### Steps (two ingesters; each gets its own commit)

**BLS:**
1. `go/internal/ingest/bls/bls.go` — port `scripts/ingest/bls.ts`. POST `https://api.bls.gov/publicAPI/v2/timeseries/data/`; body `{"seriesid": [...], "startyear": ..., "endyear": ..., "registrationkey": "..."}` with up to 50 IDs per call (chunked).
2. Filter `period` field: keep `M01–M12`, drop `M13` (annual average).
3. Construct `observedAt` as `{year}-{MM}-01` from `period` (M01 → 01).
4. Fixture: `testdata/bls_response.json`.
5. `cmd/ingest-bls/main.go`.

**QCEW:**
1. `go/internal/ingest/qcew/qcew.go` — port `scripts/ingest/qcew.ts`. Per-year CSV download from BLS QCEW open data; filter rows by NAICS code (federal employment industry code from TS).
2. Use `encoding/csv` with header row, since QCEW is well-formed.
3. County FIPS construction: state FIPS column + county FIPS column.
4. Fixture: `testdata/qcew_sample.csv` (~50 rows, DMV-only).
5. `cmd/ingest-qcew/main.go`.

### Verification

```bash
BLS_API_KEY=$KEY npm run ingest:bls --workspace=scripts
cd go && go run ./cmd/ingest-bls
diff <(jq -S 'sort_by(.fips, .series, .observedAt)' ../scripts/.cache/bls.json) \
     <(jq -S 'sort_by(.fips, .series, .observedAt)' .cache/bls.json)

# Same for QCEW
```

Empty diff.

### Commits
`feat(go): BLS LAUS ingester` then `feat(go): QCEW ingester`

---

## Slice 5 — Zillow + Redfin ingesters

### Steps

**Zillow:**
1. `go/internal/ingest/zillow/zillow.go` — port `scripts/ingest/zillow.ts`.
2. Download wide-format CSV (one row per region, columns = months). Use `encoding/csv` with header row.
3. Match region name to FIPS via `counties.ByName`. Skip rows that don't match.
4. Transpose: for each (region, month) cell, emit one `Observation`.
5. Datasets to fetch: ZHVI all homes, ZHVI SFH, ZHVI condo, ZORI rent — match the TS list exactly.
6. Fixture: `testdata/zhvi_county_sample.csv` (~20 rows trimmed to DMV).

**Redfin:**
1. `go/internal/ingest/redfin/redfin.go` — port `scripts/ingest/redfin.ts`.
2. Download `https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz` (URL per TS).
3. Stream through `gzip.NewReader` → `bufio.Scanner` with `scanner.Buffer(make([]byte, 1<<20), 32<<20)`. Header on line 1; for each subsequent line, `strings.Split(line, "\t")`. Filter on `state_code` column index (DC/MD/VA). Skip rows that don't match — `continue` BEFORE allocating per-field slices.
4. Property types: parse the `property_type` column; emit one observation per (county, metric, period, property_type) tuple.
5. Fixture: `testdata/redfin_sample.tsv` (header + 100 hand-curated rows: DC/MD/VA + a few CA rows to verify filtering).

**Both:**
- `cmd/ingest-zillow/main.go`, `cmd/ingest-redfin/main.go` — same shape as previous slices.

### Verification

```bash
npm run ingest:zillow --workspace=scripts
cd go && go run ./cmd/ingest-zillow
diff <(jq -S 'sort_by(.fips, .series, .observedAt)' ../scripts/.cache/zillow.json) \
     <(jq -S 'sort_by(.fips, .series, .observedAt)' .cache/zillow.json)

# Redfin memory check
/usr/bin/time -v go run ./cmd/ingest-redfin 2>&1 | grep "Maximum resident"
# Must report < 256 MB (= 262144 KB)
```

Both diffs empty. Redfin RSS under cap.

### Commits
`feat(go): Zillow ZHVI/ZORI ingester` then `feat(go): Redfin streaming TSV ingester`

---

## Slice 6 — Full transform, DMV aggregates, affordability, market health

### Steps

1. **`go/internal/transform/affordability.go`** — port `scripts/transform/affordability.ts` (NAR HAI formula: `HAI = (medianHouseholdIncome / qualifyingIncome) × 100`; qualifying income derived from mortgage rate, home value, 25% DTI). Use `*float64` throughout to handle missing inputs.

2. **`go/internal/transform/market_health.go`** — port `scripts/transform/marketHealth.ts`. Composite scoring formula; mirror exactly.

3. **`go/internal/transform/dmv.go`:**
   ```go
   func BuildActiveListingsDmv(obs []types.Observation, cs []counties.County) types.ActiveListingsDmv
   func BuildFederalEmploymentDmv(obs []types.Observation, cs []counties.County) types.FederalEmploymentDmv
   ```
   Sum per-county series into DMV-wide series; track `contributingFips` and `coverage.missing`.

4. **Extend `BuildCountyPages`** to populate every `CountySummary` field by joining across all six caches. Source-of-truth precedence on conflicts: same as TS (read `scripts/transform/build-county-pages.ts` to confirm — DO NOT GUESS, mirror exactly).

5. **`go/internal/transform/build_all_test.go`** — full golden under `testdata/transform/golden/full/{fips}.json` (one per county) + `dmv/active-listings.json` + `dmv/federal-employment.json` + `manifest.json`. Goldens are captured by running today's TS transform against a known set of cache fixtures and copying outputs.

6. **Extend `cmd/transform/main.go`** to also write `dmv/active-listings.json`, `dmv/federal-employment.json`, and `metrics/*.json` (one per national/metro series).

### Verification (the milestone)

```bash
# Snapshot TS output
npm run ingest --workspace=scripts -- --all  # requires all API keys
npm run transform --workspace=scripts
cp -r web/public/data /tmp/ts-full

# Snapshot Go output
cp scripts/.cache/*.json go/.cache/
cd go && go run ./cmd/transform

# Full byte-equivalence
diff -r <(cd /tmp/ts-full && find . -name '*.json' -exec jq -S . {} \; -exec echo '---FILE---' \;) \
        <(cd ../web/public/data && find . -name '*.json' -exec jq -S . {} \; -exec echo '---FILE---' \;)
```

Empty diff. **This is the cutover gate.** If the diff has entries, file a sub-task per file and resolve before Slice 7.

**Acceptable differences:** `manifest.generatedAt` timestamp (run time), `lastUpdated` timestamps if generated independently. These should be excluded from the diff via `jq 'del(.generatedAt, .lastUpdated)'`.

### Commit
`feat(go): full transform with DMV aggregates, affordability, market health`

---

## Slice 7 — `ingest-all`, `check-bundle-size`, root Makefile

### Steps

1. **`go/cmd/ingest-all/main.go`:**
   ```go
   sources := []ingest.DataSource{ fred.New(...), census.New(...), bls.New(...), qcew.New(...), zillow.New(...), redfin.New(...) }
   var errs []error
   for _, s := range sources {
       obs, err := s.Fetch(ctx)
       if err != nil { errs = append(errs, fmt.Errorf("%s: %w", s.Name(), err)); continue }
       _ = storage.WriteJSON(".cache/"+s.Name()+".json", obs) // also log+collect errors
   }
   if len(errs) > 0 { return errors.Join(errs...) } // exit 1 with all failures
   ```
   One source failure does not skip later sources — matches today's `--all` behavior.

2. **`go/cmd/check-bundle-size/main.go`** — port `scripts/check-bundle-size.ts`. Walk `web/dist/assets/*.js` and `*.css`, sum bytes, compare against a budget constant (read current budget value from `scripts/check-bundle-size.ts`). Exit non-zero on overrun with a descriptive message.

3. **Root `/Makefile`:**
   ```makefile
   .PHONY: ingest transform web check-bundle-size test

   ingest:
   	cd go && go run ./cmd/ingest-all

   transform:
   	cd go && go run ./cmd/transform

   web:
   	npm run build

   check-bundle-size: web
   	cd go && go run ./cmd/check-bundle-size

   test:
   	cd go && go test ./...
   	npm test
   ```

### Verification

```bash
# From a clean tree
rm -rf go/.cache web/public/data/counties/*.json web/public/data/metrics/*.json
make ingest && make transform
diff -r /tmp/ts-full web/public/data  # should still be empty modulo timestamps

# Bundle size: artificially tighten budget in source, expect failure
make check-bundle-size  # exit 0 on current build
# Edit go/cmd/check-bundle-size/main.go: set budget = 1 byte
make check-bundle-size  # exit 1
git checkout go/cmd/check-bundle-size/main.go
```

### Commit
`feat(go): ingest-all orchestrator, check-bundle-size port, root Makefile`

---

## Slice 8 — CI cutover, delete `scripts/`, docs

### Steps

1. **Update `.github/workflows/ingest.yml`:**
   - Replace `actions/setup-node@v4` block with:
     ```yaml
     - uses: actions/setup-go@v6
       with:
         go-version: '1.26'
         cache-dependency-path: go/go.sum
     ```
   - Replace install + ingest + transform steps with:
     ```yaml
     - name: Ingest all sources
       run: go run ./cmd/ingest-all
       working-directory: go
       env:
         FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
         CENSUS_API_KEY: ${{ secrets.CENSUS_API_KEY }}
         BLS_API_KEY: ${{ secrets.BLS_API_KEY }}

     - name: Transform → per-county JSON
       run: go run ./cmd/transform
       working-directory: go
     ```
   - Keep checkout, concurrency group, commit step, and `INGEST_PUSH_TOKEN` unchanged.

2. **Delete `scripts/`:**
   ```bash
   git rm -r scripts/
   ```

3. **Update root `package.json`:** remove `"scripts"` from the `workspaces` array. Remove any root-level `npm run ingest` / `npm run transform` script aliases that point into `scripts/`. Leave the web build aliases.

4. **Update docs:**
   - `CLAUDE.md` "Commands" section: replace `npm run ingest --workspace=scripts` with `make ingest`; same for transform. Update the "Architecture" section's data-flow diagram to read `go/cmd/ingest-all` → `go/.cache/{source}.json` → `go/cmd/transform`.
   - `ARCHITECTURE.md`: replace the "Node.js ingest + transform pipeline" sentence with "Go ingest + transform pipeline." Note the `avast/retry-go`, `log/slog`, `godotenv`+`caarlos0/env` choices in a new "Go toolchain" subsection.
   - `PROJECT_SPEC.md`: update the "Ingester pattern" reference to point at `go/internal/ingest/`.
   - `DATA_SOURCES.md`: update each source's "Ingester contract" to reference the new Go file path.
   - `go/README.md`: new file covering local dev: prerequisites (Go 1.26+), `.env` setup at `go/.env`, `make ingest`, `make transform`, `go test ./...`.

5. **Update root `.gitignore`** if needed: add `go/.cache/`. Remove `scripts/.cache/`.

6. **Update `.github/workflows/test.yml`** (if present): add a Go test step alongside the Node test step.

### Verification

```bash
# Local
make test  # Go tests + remaining npm tests pass
make ingest && make transform  # produces no-diff data
git status  # only intended deletions and additions

# Push and watch CI
git push origin feat/go-ingest-refactor
gh pr create --base main --title "feat: port ingest pipeline to Go 1.26" --body "..."
gh pr checks --watch

# After merge, manual dispatch
gh workflow run ingest
gh run watch
# Resulting commit on main should be the no-op `data: monthly refresh` (no actual data changes)
# OR no commit at all if the workflow's "if git diff --staged --quiet" guard fires.
```

### Commit
`feat(go): cut over CI to Go pipeline; remove scripts/ workspace`

---

## Deviations from design (summary)

1. **`MaybeFloat` needs `MarshalJSON`** as well as `UnmarshalJSON` — required for the round-trip contract test. Design only specified Unmarshal. Documented in Slice 0, step 3.
2. **`golang.org/x/term`** added as a transitive dep for TTY detection in `internal/log/`. Not listed in the design's dep set; trivially small and used only at startup. Noted in Slice 0, step 6.
3. **`gzip.NewReader`** path for Redfin (the file is `.tsv000.gz`). Design mentioned `bufio.Scanner` but not the gzip wrapper. Added explicitly in Slice 5.
4. **`-update` flag support** in golden test helpers is implicit in the design ("supports `go test -update`") but the implementation pattern is concrete: declare `var update = flag.Bool("update", false, "update goldens")`. Noted in Slice 2, step 3.

## Next
**Phase:** Implement
**Artifact to review:** `docs/crispy/go-ingest-refactor/5-plan.md`
**Action:** Review structure and key decisions — this is a spot-check document. Then invoke `crispy-implement` with project name `go-ingest-refactor`.
