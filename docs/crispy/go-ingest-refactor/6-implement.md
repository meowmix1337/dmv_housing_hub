# Implementation Log

Execution of `docs/crispy/go-ingest-refactor/5-plan.md`. **All nine slices complete.**
- Prior session implemented Slices 0–2 on disk but left them uncommitted.
- This session (2026-05-11→12) split that work into slice-aligned commits on `feat/go-ingest-refactor` and continued through Slice 8 — the destructive CI cutover and `scripts/` deletion.

Branch: `feat/go-ingest-refactor` (off `main`, unpushed).

## Session-level setup (2026-05-11)

- The plan was authored assuming work would happen on `feat/go-ingest-refactor`, but Slices 0–2 had already been written by a previous session and were sitting uncommitted on `main`. First action this session was creating `feat/go-ingest-refactor` off `main`, then splitting the in-flight files into three slice-aligned commits before continuing.
- Added a "API keys for verification gates" bullet to `5-plan.md`'s Conventions block, recording that `FRED_API_KEY`, `CENSUS_API_KEY`, `BLS_API_KEY` already live in repo-root `.env` and are auto-loaded by `godotenv.Load("../.env", ".env")` (Go) / `dotenv/config` (TS). Persisted the same fact in auto-memory so future sessions won't waste time asking.

## Slice 0 — Go workspace skeleton + foundation libraries

**Status:** ✅ PASS — committed `6b155fc`

**What was done (from prior session):**
- `go/go.mod` → `go 1.26`, module `github.com/meowmix1337/dmv_housing_hub/go`.
- `go/.gitignore` excludes `.cache/`, `.env`, `*.tmp-*` (this session added `go build` binaries — see below).
- Deps: `avast/retry-go/v4 v4.7.0`, `joho/godotenv v1.5.1`, `caarlos0/env/v11 v11.4.1`, `golang.org/x/term v0.43.0`.
- `internal/types`: full hand-port of `shared/src/types.ts`. `MaybeFloat` ships with both `UnmarshalJSON` and `MarshalJSON`.
- `internal/types/testdata/county_summary_golden.sorted.json`: captured from `web/public/data/counties/51685.json`, jq-sorted.
- `internal/types/types_contract_test.go`: `TestCountySummaryRoundTrip` + `TestMetricIdValid` + `TestMaybeFloatRoundTrip`.
- `internal/log`: TTY-aware slog handler.
- `internal/http`: retry-go client honoring `Retry-After` (numeric + HTTP date), 5xx retry, non-retryable 4xx, typed `*HTTPError`. Tests cover Retry-After, non-retryable 404, 5xx retry, RetryAfter parsing edge cases.
- `internal/storage`: atomic temp-then-rename writer + `WriteJSON`. Tests cover happy path, missing parent, no-clobber.

**Checkpoint:**
- `go vet ./...` → clean
- `go test ./...` → all packages OK
- `golangci-lint run ./...` → 0 issues

**Deviations:** as listed in the plan's "Deviations" section (MaybeFloat MarshalJSON; `golang.org/x/term`).

## Slice 1 — FRED ingester end-to-end

**Status:** ✅ PASS — committed `edef5fc`

**What was done (from prior session):**
- `internal/counties/counties.go`: hand-port of `DMV_COUNTIES` (21 counties: 1 DC + 9 MD + 11 VA). `All`, `ByFIPS`, `ByName`, `ByJurisdiction`. Test asserts length + jurisdiction distribution.
- `internal/ingest/datasource.go`: `DataSource` interface.
- `internal/ingest/fred/fred.go`: ports `scripts/ingest/fred.ts` — same series order, same `stateSeriesToFIPS`, 600ms inter-county sleep, warn-and-continue per series.
- `internal/ingest/fred/testdata/series_{MORTGAGE30US,ATNHPIUS11001A}.json` fixtures with the `.` sentinel.
- `internal/ingest/fred/fred_test.go`: happy path against httptest, sentinel skipped, partial failure continues.
- `cmd/ingest-fred/main.go`: `godotenv.Load("../.env", ".env")` → `env.Parse(&cfg)` → `IngestResult{source, startedAt, finishedAt, durationMs, count, observations}` → `storage.WriteJSON(".cache/fred.json", result)`.

**Checkpoint (live API, this session):**
- TS: `npm run ingest:fred --workspace=scripts` → count=9910.
- Go: `go run ./cmd/ingest-fred` → count=9910.
- `diff <(jq -S '.observations | sort_by(.fips, .series, .observedAt)' …) <(…)` → **empty**.

**Deviations:** none beyond Slice 0.

## Slice 2 — Transform end-to-end with FRED only

**Status:** ✅ PASS — committed `7d7918a`

**What was done (from prior session):**
- `internal/transform/county_pages.go`: `BuildCountyPages(obs, cs, extras, generatedAt)`. FRED-only: populates `series.fhfaHpi` (date-sorted ascending) plus `series.medianListingPrice`. Other fields nil/zero.
- `internal/transform/manifest.go`: `BuildManifest` + per-source `CadenceFor`.
- `cmd/transform/main.go`: walks `.cache/*.json`, decodes `IngestResult` wrappers, writes per-county pages + `manifest.json`. Missing cache → manifest entry with `status:"stale"`. `OUT_DATA_DIR` env override.

**Checkpoint (FRED-only isolation, this session):**
- Stashed non-FRED TS caches; ran `npm run transform`; snapshotted output to `/tmp/ts-fred-only/`; restored stash.
- Ran `go run ./cmd/transform` against a `go/.cache/` containing only `fred.json`.
- Per-county diff of `.series.fhfaHpi` across all 21 counties → 0 counties differ.
- Per-county diff of `.series.medianListingPrice` across all 21 counties → 0 counties differ.
- After verifying, restored `web/public/data/` via a full TS rebuild; only `lastUpdated` timestamps had churned; reverted before committing so the commit is pure Go code.

**Deviations:**
- `BuildCountyPages` takes a flat `[]types.Observation` instead of the planned `map[string][]types.Observation` — `Observation.Source` lets it filter internally. No effect on outputs.
- TS produces a top-level `propertyTaxRate` field from a static lookup; Go doesn't yet. Per the plan that lookup is a Slice 6 addition.

## Slice 3 — Census ACS ingester

**Status:** ✅ PASS — committed `05804c4`

**What was done (this session):**
- `internal/ingest/census/census.go`: ports `scripts/ingest/census.ts`. Three state-group calls (DC county 001; MD county *; VA county *). `B19013_001E` / `B25077_001E` / `B25064_001E` paired with `_001M` margins. `-666666666` sentinel + missing/non-numeric cells logged and skipped. `ParseRows` exported so most coverage doesn't need HTTP plumbing.
- `internal/ingest/census/testdata/acs5_state_11.json` (DC happy path), `acs5_state_24_sentinel.json` (MD with sentinel + non-DMV filter + multi-county).
- `internal/ingest/census/census_test.go`: DC parse, sentinel filter, end-to-end against `httptest` server routing per `in=state:NN`.
- `cmd/ingest-census/main.go`: mirrors `ingest-fred/main.go`.
- `go/.gitignore`: added entries for `go build ./cmd/...` binaries that land at module root.

**Checkpoint (live API, this session):**
- TS: `npm run ingest:census --workspace=scripts` → count=63.
- Go: `go run ./cmd/ingest-census` → count=63.
- `diff <(jq -S '.observations | sort_by(.fips, .series, .observedAt)' …) <(…)` → **empty**.
- `go vet`, `go test ./...`, `golangci-lint run ./...` → all clean.

**Deviations:** none.

## Slice 4 — BLS LAUS + QCEW ingesters

### 4a — BLS LAUS

**Status:** ✅ PASS — committed `9523cbe`

**What was done (this session):**
- `internal/ingest/bls/bls.go`: ports `scripts/ingest/bls.ts`. Single POST with 22 series (21 county `LAUCN{fips}0000000003` unemployment-rate + 1 MSA `SMU11479009091000001` federal-employment). No chunking — DMV fits well under BLS's 50/series limit, matching TS. `PeriodToISO` drops M13 (annual average) and zero-pads M01–M09. Non-success status → error.
- `internal/ingest/bls/testdata/bls_response.json`: fixture with both LAUS and SMU series, including M13 rows that must be filtered.
- `internal/ingest/bls/bls_test.go`: `PeriodToISO` table test, parse-from-fixture asserting 4 obs (M13 dropped from both series), non-success-status returns error, `httptest` POST end-to-end.
- `cmd/ingest-bls/main.go`: standard ingest-{src} pattern.

**Checkpoint (live API):**
- TS: `npm run ingest:bls --workspace=scripts` → count=2929.
- Go: `go run ./cmd/ingest-bls` → count=2929.
- `diff <(jq -S '.observations | sort_by(.fips, .series, .observedAt)' …) <(…)` → **empty**.

**Deviations:**
- Plan said "up to 50 series per POST (chunked)" but TS doesn't actually chunk — it sends all 22 in one POST. Go matches TS behavior. If DMV ever exceeds 50, chunking would be added then.

### 4b — QCEW

**Status:** ✅ PASS — committed `6e1472a`

**What was done (this session):**
- `internal/ingest/qcew/qcew.go`: ports `scripts/ingest/qcew.ts`. For every quarter from 2015 Q1 through the current quarter, pulls per-county CSV from `data.bls.gov/cew/data/api/{year}/{qtr}/area/{fips}.csv`. Selects the federal-county-total row (`own_code=1`, `agglvl_code=71`, `industry_code=10`). Series ID matches TS exactly: `qcew:{fips}:{year}Q{qtr}:own1:naics10`. 404 → warn-and-skip (data not yet published); `disclosure_code=N` suppressed rows skipped.
- Concurrency 4 across ~970 tasks via a goroutine pool; index-keyed result slice keeps ordering stable.
- Header-keyed CSV decode tolerates extra/reordered columns.
- `ParseCSV`, `SelectFederalCountyTotal`, `QuarterToObservedAt`, `RowToObservation` all exported for unit testing.
- `internal/ingest/qcew/testdata/qcew_sample.csv`: 3 rows (non-federal MSA total, the federal county total we want, a `own_code=2` row that should be skipped).
- `internal/ingest/qcew/qcew_test.go`: quarter→date table, CSV parse + row select, observation happy path, suppressed (`N`) → nil, non-numeric → nil.
- `cmd/ingest-qcew/main.go`.

**Checkpoint (live API):**
- TS: `npm run ingest:qcew --workspace=scripts` → count=903.
- Go: `go run ./cmd/ingest-qcew` → count=903 (one 404 on 51685 2026 Q2, same as TS).
- `diff <(jq -S '.observations | sort_by(.fips, .observedAt, .series)' …) <(…)` → **empty**.

**Deviations:** none.

## Slice 5 — Zillow + Redfin ingesters

### 5a — Zillow ZHVI/ZORI

**Status:** ✅ PASS — committed `318a61c`

**What was done (this session):**
- `internal/ingest/zillow/zillow.go`: ports `scripts/ingest/zillow.ts`. Five files (4 county-scope ZHVI/ZORI + 1 metro-scope DC ZHVI). Wide-format CSVs are transposed in one pass — header columns matching `\d{4}-\d{2}-\d{2}` become observedAt values.
- `BuildFipsIndex` mirrors TS aliases: lowercased canonical name, `city`/`(city)` suffix variants, and apostrophe-stripped variant (so "Prince George's County" → "prince georges county").
- `ParseCSV` exported for unit testing.
- `testdata/zhvi_county_sample.csv` covers DC, MD, VA + empty cells + an out-of-DMV PA row.
- Metro-scope path: only `Washington, DC` → FIPS `47900`.
- `cmd/ingest-zillow/main.go`.

**Checkpoint (live API):**
- TS: `npm run ingest:zillow --workspace=scripts` → count=22861.
- Go: `go run ./cmd/ingest-zillow` → count=22861.
- `diff <(jq -S '.observations | sort_by(.fips, .series, .observedAt)' …) <(…)` → **empty**.

**Deviations:** none.

### 5b — Redfin streaming TSV

**Status:** ✅ PASS — committed `1a86aae`

**What was done (this session):**
- `internal/ingest/redfin/redfin.go`: ports `scripts/ingest/redfin.ts`. Streams the ~226 MB gzipped county market tracker through `gzip.NewReader` → `bufio.Scanner` (1 MB initial / 32 MB max buffer). Hot-path filtering avoids allocating the full row slice until a line clears the DMV state-code / PERIOD_DURATION==30 / REGION_TYPE==county / known-property-type gates.
- `fieldAt(line, n)` walks tabs without allocating; `unquote()` strips Redfin's double-quoted string fields (header + string cells; numeric cells are bare — discovered during the live verification when the first run failed to find `PERIOD_DURATION` in the unstripped header).
- State-prefixed FIPS index (`"<STATE_CODE>:lowercase-name"`) prevents VA/MD collisions on shared names (Frederick, Montgomery). Baltimore City alias added explicitly.
- `testdata/redfin_sample.tsv` (11 rows, double-quoted to mirror the wire format): DC×2, Baltimore City alias, Howard MD, Alexandria VA, Frederick "VA" (should not bleed to MD's 24021), DC metro row (regiontype filter), DC weekly row (period filter), CA (state filter), Bigsby MD (not in DMV), Howard MD with Apartment Complex (unknown property type).
- `ParseStream` exported; `httptest` server wraps the fixture in gzip for end-to-end coverage.
- `cmd/ingest-redfin/main.go`.

**Checkpoint (live + memory cap):**
- TS: `npm run ingest:redfin --workspace=scripts` → count=155,518.
- Go: `go build -o /tmp/ingest-redfin ./cmd/ingest-redfin && /usr/bin/time -l /tmp/ingest-redfin` → count=155,518.
- `diff <(jq -S '.observations | sort_by(.fips, .series, .metric, .observedAt)' …) <(…)` → **empty**.
- Maximum resident set size: 205,373,440 B (~196 MB). Peak memory footprint: 191,726,432 B (~183 MB). Both well under the plan's 256 MB cap.

**Deviations:**
- The plan didn't mention that Redfin's TSV double-quotes string columns. The first live run blew up on a missing `PERIOD_DURATION` column. Added `unquote()` and updated the fixture to mirror the real wire format. Documented inline.

## Slice 6 — Full transform + DMV aggregates + cutover gate

**Status:** ✅ PASS — committed `ca63d97`

**What was done (this session):**
- `internal/transform/affordability.go`: NAR HAI. **Uses `Exp(n*Log)` instead of `Pow(x, n)`** so the result matches V8's `Math.pow` algorithm. Go's `math.Pow` takes a fast integer-exponent path that diverges from V8 in the last ULP for these inputs (caught during the first cutover-gate run as 14th-significant-digit diffs in every county's `affordabilityIndex`).
- `internal/transform/market_health.go`: 0..100 composite score; needs ≥3 sub-inputs.
- `internal/transform/property_tax_rates.go`: static FY2025/2026 rates per FIPS.
- `internal/transform/verification.go`: parses DATA_SOURCES.md `## Verification` subsections into per-source `lastVerified` for the manifest.
- `internal/transform/active_listings.go`: per-county Redfin breakdown (SFR + condo + townhouse required; multi-family defaults to 0).
- `internal/transform/dmv.go`: `BuildFederalEmploymentDmv` (all-or-skip on full DMV coverage) + `BuildActiveListingsDmv` (95% coverage-ratio threshold, full-coverage dates only).
- `internal/transform/dedupe.go`: Redfin all_residential-first stable sort + dedup by `(source, fips, metric, observedAt)`, with `active_listings` additionally keyed on series so the four property-type rows survive.
- `internal/transform/county_pages.go`: rewritten to populate every `CountySummary` field — `zhvi`, `medianSalePrice`, `daysOnMarket`, `monthsSupply`, `unemployment`, `saleToList`, `pctSoldAboveList`, `activeListings` + YoY, qcew `federalEmployment` + YoY + asOf, `propertyTaxRate` from static lookup, `marketHealthScore`, `affordabilityIndex`, plus `medianHouseholdIncome` from Census. `isoYearAgo` mirrors TS's `setUTCFullYear(-1)`.
- `cmd/transform/main.go`: writes `metrics/mortgage-rates.json`, `metrics/federal-employment-dmv.json`, `metrics/active-listings-dmv.json`, and enriches the manifest with `lastVerified` from DATA_SOURCES.md. Calls `SortAndDeduplicate` before `BuildCountyPages` so per-county filters never see Redfin property-type rows for non-breakdown metrics.
- `types`: `LatestYoY` / `TotalYoY` on the DMV files get `omitempty` to match TS's `JSON.stringify(undefined)` drop-field behavior.

**Checkpoint (full cutover gate):**
- Ran `npm run transform --workspace=scripts`; snapshotted `web/public/data/` to `/tmp/ts-full/`.
- Copied `scripts/.cache/*.json` into `go/.cache/`; ran `OUT_DATA_DIR=/tmp/go-full go run ./cmd/transform`.
- Per-county diff `diff <(jq -S 'del(.lastUpdated)' /tmp/ts-full/counties/$fips.json) <(jq -S 'del(.lastUpdated)' /tmp/go-full/counties/$fips.json)` → **0 of 21 counties differ**.
- Metrics: `diff <(jq -S 'del(.lastUpdated, .generatedAt)' /tmp/ts-full/metrics/$name) <(jq -S 'del(.lastUpdated, .generatedAt)' /tmp/go-full/metrics/$name)` → empty for all 3 (mortgage-rates, active-listings-dmv, federal-employment-dmv).
- Manifest with timestamps stripped → empty diff.
- File-tree diff `(find /tmp/ts-full -name '*.json' -not -path '*/.omc/*' | sort) vs (find /tmp/go-full ...)` → empty.
- `go vet`, `go test ./...`, `golangci-lint run ./...` → all clean.

**Deviations:**
1. **`math.Exp(n*math.Log(1+r))` instead of `math.Pow(1+r, n)`**: needed for cross-language FP parity vs V8. Documented inline.
2. **`web/public/data/` not refreshed in this commit**: the TS refresh ran during verification picked up `aggregation` and `contributingFips` fields that the previously committed JSON was missing (TS schema-vs-output drift unrelated to this slice). Per `CLAUDE.md`'s data-prefix rule, that refresh belongs in a separate `data:` commit, so I reverted `web/public/data/` before committing. The user can run `npm run transform` (or once Slice 7's Makefile lands, `make transform`) to refresh data and commit it separately.

## Slice 7 — ingest-all + check-bundle-size + Makefile

**Status:** ✅ PASS — committed `f83cb75`

**What was done (this session):**
- `cmd/ingest-all/main.go`: runs every `DataSource` (fred, census, bls, qcew, zillow, redfin) sequentially. Per-source failure is logged and collected via `errors.Join`; later sources still run, matching TS `--all`. Non-zero exit if any source failed.
- `cmd/check-bundle-size/main.go`: ports `scripts/check-bundle-size.ts`. Walks `web/dist/assets/*.js`, streams each through `gzip.NewWriter` at default level (Node's `createGzip` default; the most common cross-impl match), fails if any chunk exceeds 500 kB gz. Output mirrors the TS line format.
- `/Makefile`: phony targets `ingest`, `transform`, `web`, `check-bundle-size` (depends on `web`), `test` (Go + npm). All targets `cd` into `go/` where needed.

**Checkpoint:**
- `make web && make check-bundle-size` → exit 0, headroom 289.5 kB on the only `.js` chunk.
- Tighten budget to 1 byte → exit 1 with the `OVER BUDGET` line (then reverted).
- `make test` → 15 npm tests + Go tests across 11 packages all pass.
- `go vet`, `golangci-lint run` → clean.

**Deviations:**
- Go's stdlib `compress/gzip` and Node's `zlib` produce slightly different compressed bytes at the same default level (~0.5 kB delta on the only chunk: 210.5 kB Go vs 210.0 kB TS). Documented in the commit; doesn't matter for an enforcement gate.

## Slice 8 — CI cutover + delete scripts/ + docs

Split into two commits per user direction.

### 8a — Docs + CI rewrite (additive)

**Status:** ✅ PASS — committed `a168a9a`

**What was done:**
- `.github/workflows/ingest.yml`: rewritten to use `actions/setup-go@v6` (with `cache-dependency-path: go/go.sum`) + `go run ./cmd/ingest-all` + `go run ./cmd/transform` (both `working-directory: go`). API key env block, concurrency group, INGEST_PUSH_TOKEN, and the commit-and-push step unchanged.
- `CLAUDE.md`: Commands section repointed to `make ingest` / `make transform` and `go run ./cmd/ingest-*`; Workspace + Data flow now reference `go/` and `go/.cache/`; Ingester pattern shows the Go interface; Libraries section lists `internal/http`, `internal/storage`, `internal/log`.
- `ARCHITECTURE.md`: D2 rewritten as "TypeScript on the frontend; Go for ingest + transform" with the hand-mirror + contract test rationale and a Go toolchain subsection; `scripts/transform` reference repointed to `go/cmd/transform`; closing one-liner mentions both languages.
- `PROJECT_SPEC.md`: short callout at the top noting the post-v1 port, pointing at `go/README.md` and the CRISPY workflow log. Spec body unchanged (it's the original v1 build plan).
- `DATA_SOURCES.md`: `scripts/` paths repointed (ingest/, .cache/, lib/verification.ts → `go/internal/transform/verification.go`); ACS year bump note now references `go/internal/ingest/census/census.go`.
- `go/README.md`: new file. Prerequisites, layout, local dev, key design decisions (no backend, hand-mirror types, retry-after, Redfin streaming, V8 pow parity), and an "adding a new ingester" checklist.

**Checkpoint:** all docs sweep clean of `scripts/(ingest|transform|lib)/`, `workspace=scripts`, and `npm run ingest|transform` references. `go vet`, `go test ./...`, `golangci-lint` clean.

**Deviations:** none.

### 8b — Delete scripts/ workspace (destructive)

**Status:** ✅ PASS — committed `e2480a4`

**What was done:**
- `git rm -r scripts/` (35 files, ~3,800 LOC).
- Root `package.json`: drop `"scripts"` from workspaces; remove `ingest` and `transform` script aliases; rewire `check-bundle-size` to `cd go && go run ./cmd/check-bundle-size`.
- `package-lock.json`: regenerated via `npm install` against the smaller workspace set.
- `.gitignore`: drop `scripts/.cache/` and `scripts/raw-archives/`; add `go/.cache/`.

**Checkpoint:**
- `npm install` → clean
- `npm run typecheck` → clean
- `npm test` → 15 tests pass
- `make test` → Go + npm pass
- `make check-bundle-size` → 210.5 kB / 500 kB budget
- `make transform` → output byte-identical to the slice-6 TS snapshot (excluding timestamps)

**Deviations:** none.

**CI verification (still to do — depends on push):**
The plan's slice 8 verification step recommends `gh pr create` and `gh pr checks --watch` after pushing the branch. Branch is unpushed; the user opens the PR.

## Summary

| Slice | Status | Commit    |
|-------|--------|-----------|
| 0     | done   | `6b155fc` |
| 1     | done   | `edef5fc` |
| 2     | done   | `7d7918a` |
| 3     | done   | `05804c4` |
| 4a    | done   | `9523cbe` |
| 4b    | done   | `6e1472a` |
| 5a    | done   | `318a61c` |
| 5b    | done   | `1a86aae` |
| 6     | done   | `ca63d97` |
| 7     | done   | `f83cb75` |
| 8a    | done   | `a168a9a` |
| 8b    | done   | `e2480a4` |

All 12 commits landed on `feat/go-ingest-refactor` with every checkpoint passing. The cutover-gate slice (6) produced a byte-equivalent (timestamp-excluded) `web/public/data/` tree. The destructive slice (8b) verified locally; CI verification on push is the user's call.

**Open follow-up:**
- The committed `web/public/data/` on `main` is missing two fields the TS schema (now Go schema) writes: `aggregation` and `contributingFips` in `metrics/active-listings-dmv.json`, plus shuffled key order in county summaries. A separate `data: refresh outputs to current schema` commit on this branch (or via the first cron run on main after merge) backfills them. Not blocking the cutover.

## Next
**Phase:** Delivery
**Artifact to review:** `docs/crispy/go-ingest-refactor/6-implement.md`
**Action:** Review the implementation log. Then invoke `crispy-delivery` with project name `go-ingest-refactor`.
