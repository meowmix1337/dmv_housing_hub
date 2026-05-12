# Plan

Eight slices, executed in order. Each slice is independently committable on its own feature branch off `main`. Run `npm run typecheck && npm run lint && npm run test` at every checkpoint.

Two deviations from the design discussion to note up front:
- An existing `web/src/components/Source.tsx` component is already in the tree; Slice 6 will reuse and extend it rather than introducing a new `<SourceLine />`.
- Adding `aggregation`/`contributingFips` fields to `ActiveListingsDmv` and a parallel new `FederalEmploymentDmv` interface is a non-breaking type extension; existing JSON outputs remain valid because the new fields are produced by the build and not asserted by the consumer at runtime.

---

## Slice 1 — Spot-check workflow in `DATA_SOURCES.md`

Branch: `docs/data-sources-verification`

**Steps:**
1. Open `DATA_SOURCES.md`. After the existing per-source contracts, add a top-level section `## Verification`.
2. Under it, add this preamble:
   - "Spot-check, not automated. Run the steps below at every monthly ingest, on any ingester change, and on any methodology change at the upstream source."
   - "Sentinel FIPS: `11001` (DC), `24031` (Montgomery MD), `51059` (Fairfax VA), `51610` (Falls Church city VA)."
3. Add one subsection per source with this exact shape:
   ```md
   ### fred
   - Spot-check URL: https://fred.stlouisfed.org/graph/fredgraph.csv?id=ATNHPIUS{FIPS}A
   - What to compare: latest annual `value` against `series.fhfaHpi` tail in the matching `web/public/data/counties/{fips}.json`
   - Tolerance: exact (FRED publishes 2-decimal rounded values)
   - Last verified: 2026-05-10
   ```
4. Source URLs to use:
   - `fred`: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=ATNHPIUS{FIPS}A` and `https://fred.stlouisfed.org/series/MORTGAGE30US`
   - `census`: `https://api.census.gov/data/2024/acs/acs5?get=NAME,B19013_001E,B19013_001M&for=county:*&in=state:11,24,51`
   - `bls`: `https://www.bls.gov/web/metro/laucntycur14.txt` (rolling 14-month NSA county file)
   - `qcew`: `https://data.bls.gov/cew/data/files/{year}/csv/{year}_qtrly_singlefile.zip` and the per-area CSV at `https://data.bls.gov/cew/data/api/{year}/{quarter}/area/{fips}.csv`
   - `zillow`: same CSV URLs the ingester uses (`https://files.zillowstatic.com/research/public_csvs/zhvi/...`)
   - `redfin`: `https://www.redfin.com/news/data-center/printable-market-data/` (PDF for the most recent month)
5. Stamp `Last verified: 2026-05-10` on every subsection (Slice 8 will refresh this date after the actual cross-check pass).

**Checkpoint:**
- `git diff DATA_SOURCES.md` shows only additions.
- A reviewer who has never seen the project can pick `fred`, paste the URL, and reach an FRED CSV download. No prior context needed.
- `npm run lint` passes (markdown-only change but lint should not regress).

## Slice 2 — Type extensions for provenance

Branch: `feat/types-provenance-fields`

**Steps:**
1. `shared/src/types.ts`:
   - Add `moe?: number` to `Observation` with a one-line JSDoc: "Margin of error at 90% CI (ACS-style); absent for sources that don't publish one."
   - Add `lastVerified?: string` to `ManifestSourceEntry` with JSDoc: "ISO date of the last manual spot-check; populated from `DATA_SOURCES.md`."
2. Create `scripts/lib/verification.ts` exporting:
   ```ts
   export interface VerificationRecord {
     source: string;
     lastVerified: string; // ISO
   }
   export function readVerificationFromMarkdown(path: string): VerificationRecord[];
   ```
   Implementation: a small parser that reads `DATA_SOURCES.md`, finds every `### <source>` under `## Verification`, and extracts the `Last verified: YYYY-MM-DD` line. If the heading is present but the date is missing or malformed, log a warn and omit the source from the output.
3. `scripts/transform/build-county-pages.ts`: when assembling `manifest.sources`, look up the matching `VerificationRecord` and set `lastVerified` on the entry.
4. Add `scripts/lib/verification.test.ts` with one happy-path and one missing-date test.

**Checkpoint:**
- `npm run typecheck && npm run lint && npm run test` all pass.
- `npm run build --workspace=scripts` (or whatever ingest-+-transform script is wired) regenerates `manifest.json` with `lastVerified` populated for the six sources.
- Existing per-county and aggregate JSONs are byte-identical other than the new manifest field.

## Slice 3 — DMV aggregate provenance labels

Branch: `feat/dmv-aggregate-provenance`

**Steps:**
1. `shared/src/types.ts`:
   - On `ActiveListingsDmv`, add `aggregation: 'in-repo county sum'` and `contributingFips: string[]`. Keep `coverage` as-is.
   - Add a new exported interface `FederalEmploymentDmv`:
     ```ts
     export interface FederalEmploymentDmv {
       metric: 'federal_employment';
       fips: 'DMV';
       unit: 'count';
       cadence: 'quarterly';
       source: 'qcew';
       lastUpdated: string;
       aggregation: 'in-repo county sum';
       contributingFips: string[];
       coverage: { fips: string[]; missing: string[] };
       total: number;
       totalYoY: number | undefined;
       asOf: string;
       points: MetricPoint[];
     }
     ```
2. `scripts/transform/build-county-pages.ts`:
   - Where the active-listings DMV aggregate is built (around line 480+), add `aggregation: 'in-repo county sum'`, derive `contributingFips` from the FIPS that produced at least one observation in this cycle, populate `coverage.fips` with all FIPS attempted and `coverage.missing` with attempted FIPS that produced zero observations.
   - Where the federal-employment DMV aggregate is built (around line 440+), import and conform to the new `FederalEmploymentDmv` type, populate the same fields.
3. Update `scripts/transform/build-county-pages.test.ts` to assert `aggregation === 'in-repo county sum'`, `contributingFips.length > 0`, and `coverage.missing` is an array (possibly empty).
4. Re-run ingest+transform; commit the regenerated `web/public/data/metrics/active-listings-dmv.json` and `federal-employment-dmv.json`.

**Checkpoint:**
- Both DMV aggregate JSONs declare `aggregation` and list `contributingFips`.
- A reviewer can answer "is this an upstream-published number?" by reading the file alone (answer: no, it's a sum across the listed FIPS).
- All workspace checks green.

## Slice 4 — ACS refresh to 2020–2024 + MOE capture

Branch: `data/acs-2024-vintage`

**Steps:**
1. `scripts/ingest/census.ts`:
   - Change `const ACS_YEAR = 2023` → `2024`.
   - Confirm `BASE_URL` interpolates correctly to `https://api.census.gov/data/2024/acs/acs5`.
   - Change `OBSERVED_AT` to `'2024-01-01'`.
   - Extend the variable list. For each existing entry like `{ variable: 'B19013_001E', metric: 'median_household_income', unit: 'USD' }`, also fetch `B19013_001M` as the MOE source. The simplest path: fetch the API with both `_001E` and `_001M` in the `get=` query, then in the row parser pair the two values into a single `Observation` with `moe` set.
2. `scripts/ingest/census.test.ts`:
   - Add a fixture row that includes `_001E` and `_001M` and assert the produced `Observation.moe` is the `_001M` numeric value.
   - Update any URL-shape assertions to expect `2024` in the path.
3. Run `CENSUS_API_KEY=… npm run ingest:census --workspace=scripts` then `npm run transform --workspace=scripts`. Commit the regenerated cache + per-county JSONs.
4. Spot-check 4 sentinel FIPS:
   - `11001`: pull `https://api.census.gov/data/2024/acs/acs5?get=NAME,B19013_001E&for=county:001&in=state:11` and compare to `web/public/data/counties/11001.json`'s `medianHouseholdIncome` ($1 tolerance).
   - Repeat for `24031`, `51059`, `51610`.

**Checkpoint:**
- `manifest.json` shows `census` with a fresh `lastUpdated`.
- Sentinel FIPS values within $1 of the API response.
- `Observation.moe` populated for every census-sourced observation in the cache; **MOE is captured but not yet rendered in the UI**.
- All workspace checks green.

## Slice 5 — Replace `affordabilityIndex` with NAR HAI

Branch: `feat/nar-affordability-index`

**Caveat (scale change):** the new HAI value is on a 0–200+ scale (centered around 100), not 0–1. Any UI threshold or color scale referencing the old scale must be updated in this same slice. Known touch points: `web/src/components/compare/DifferenceCallout.tsx` (`affordabilityIndex: 0.2` threshold), any `color-scales.ts` entry, `compare-metrics.ts` formatter and `spread` rule, `Counties.tsx` formatting, and the County page label.

**Steps:**
1. Rewrite `scripts/transform/affordability.ts` per the design:
   ```ts
   export function affordabilityIndex(input: AffordabilityInput): number | undefined {
     const { medianSalePrice, medianHouseholdIncome, mortgageRate } = input;
     if (medianSalePrice === undefined || medianHouseholdIncome === undefined) return undefined;
     const principal = medianSalePrice * 0.8;
     const r = mortgageRate / 12;
     const n = 360;
     const monthlyPI = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
     const qualifyingIncome = monthlyPI * 4 * 12;
     return (medianHouseholdIncome / qualifyingIncome) * 100;
   }
   ```
   Drop `propertyTaxRate` from `AffordabilityInput`. Keep the input interface exported.
2. Rewrite `scripts/transform/affordability.test.ts` test vectors:
   - When `medianHouseholdIncome === qualifyingIncome`, return `100` (within float tolerance).
   - One realistic-DC vector and one realistic-rural vector.
3. Update the `current.affordabilityIndex` JSDoc in `shared/src/types.ts`:
   "NAR Housing Affordability Index convention: HAI = (median household income / qualifying income) × 100. Note: NAR uses median *family* income; we substitute median *household* income from ACS B19013, which is typically lower (so this index reads slightly more conservative than NAR's published series)."
4. Update `scripts/transform/build-county-pages.ts` to drop `propertyTaxRate` from the `affordabilityIndex` call site. The `propertyTaxRate` field on `CountySummary` stays (still used elsewhere).
5. Frontend updates:
   - `web/src/lib/compare-metrics.ts`: change the formatter for `affordabilityIndex` from "percent of income" to a NAR-style integer (e.g. `Math.round(value)`); change `spread` rule (it currently buckets `affordabilityIndex` with `zhvi`/`medianSalePrice` because the old value was small; HAI sits on a different spread, recheck the threshold).
   - `web/src/components/compare/DifferenceCallout.tsx`: update the `affordabilityIndex: 0.2` threshold to `affordabilityIndex: 5` (5 HAI points) — small but visible.
   - `web/src/components/county/SnapshotGrid.tsx`: update the label to "Affordability (NAR HAI)" and the formatting (round to integer).
   - `web/src/pages/County.test.tsx`: replace `affordabilityIndex: 0.38` with a HAI-scale value (e.g. `85`).
6. Re-run `npm run transform --workspace=scripts`; commit regenerated county JSONs.
7. Spot-check: pick `51059` (Fairfax). Hand-recompute HAI from the in-repo `medianHouseholdIncome`, latest `medianSalePrice`, and the latest PMMS rate. Confirm within ±5% of the produced `current.affordabilityIndex`.

**Checkpoint:**
- All in-repo `current.affordabilityIndex` values are now in the 30–200 range.
- `npm run typecheck && npm run lint && npm run test` all pass; the County page renders the new value with the new label in `npm run dev`.

## Slice 6 — Per-source citation UI + freshness banner

Branch: `feat/source-citation-ui`

**Steps:**
1. Inspect existing `web/src/components/Source.tsx` to understand its current API. Extend (do not duplicate) so it accepts `{ metricId: MetricId, asOf?: string }` and renders "Source: <label>, as of <date>" with a link to the methodology URL.
2. Create `web/src/data/citations.ts`:
   ```ts
   import type { MetricId } from '@dmv/shared';
   export interface SourceCitation {
     source: 'fred' | 'census' | 'bls' | 'qcew' | 'zillow' | 'redfin';
     label: string;
     url: string;
     methodologyUrl?: string;
   }
   export const CITATIONS: Record<MetricId, SourceCitation> = { /* … */ };
   ```
   Populate one entry per `MetricId`. Reuse the URLs from `DATA_SOURCES.md` Slice 1.
3. Wire `<Source />` into:
   - `MetricCard.tsx` (one source line per card)
   - `PriceChart.tsx` (one source line per chart caption)
   - `HexMap.tsx` (one source line under the legend)
4. Create `web/src/components/FreshnessBanner.tsx`. Reads `manifest.json` via the existing `web/src/api.ts` pattern (likely a hook). Show the banner only when any source's `lastUpdated` is more than `cadenceMaxAgeDays(cadence)` old (monthly = 35d, quarterly = 100d, etc.). Render in `Layout.tsx` above the page content.
5. `MarketHealthBreakdown.tsx`: append a one-line note "DMV Hub Composite (in-house formula). Inputs and weights shown above." Do **not** rename `marketHealthScore` (decision deferred per design open question).
6. Add component snapshot/render tests for `<Source />` and `<FreshnessBanner />`.

**Checkpoint:**
- `npm run dev`, visit `/`, `/county/11001`, `/compare`. Every numeric value shows a source line. Every chart shows source + as-of. Banner is hidden when sources are fresh.
- All workspace checks green.

## Slice 7 — DMV boundary options doc

Branch: `docs/dmv-boundary-options`

**Steps:**
1. Create `docs/dmv-boundary-options.md` with the structure:
   - **Context:** one paragraph linking back to `2-research.md` Q1.
   - **Option A — status quo (21 jurisdictions):** what's in `shared/src/counties.ts` today; pros (existing data, no cascade); cons (no published-boundary backing).
   - **Option B — MSA-47900 (24 jurisdictions, OMB 2023):** add Fauquier/Culpeper/Warren/Clarke/Rappahannock/Fredericksburg city/Jefferson WV; remove Anne Arundel/Baltimore Co./Howard/Baltimore city/Calvert. Pros (canonical, externally cross-checkable). Cons (lose Baltimore-area users; small VA counties have sparse Redfin/Zillow coverage).
   - **Option C — CSA-548 (Wash + Baltimore, ~38 jurisdictions):** superset of A and B. Pros (broadest demographic catchment). Cons (CSA is less commonly used in housing reporting; Baltimore market dynamics differ enough to dilute "DMV" branding).
   - **Per-source coverage matrix:** rows = candidates A/B/C, columns = FRED HPI / Zillow / Redfin / QCEW / BLS LAUS / Census ACS, cells = "fully covered" / "partial (FIPS without data)" / "redundant".
   - **Recommendation:** one paragraph, framed as a recommendation pending owner sign-off.
2. Cross-link from `ARCHITECTURE.md` ("DMV boundary: see `docs/dmv-boundary-options.md`").
3. No code changes in this slice.

**Checkpoint:**
- Project owner can read the doc once and pick a boundary; outline is clear, tradeoffs are concrete.

## Slice 8 — Initial spot-check pass v1

Branch: `data/spot-check-v1`

**Steps:**
1. For each of the six sources, follow the URL in `DATA_SOURCES.md` Verification section and compare the in-repo values for the four sentinel FIPS.
2. Record results in a new `docs/verification/2026-05-spot-check.md`:
   ```md
   # Spot-check 2026-05
   | source | sentinel | in-repo | upstream | match? | notes |
   ```
3. For any discrepancy: open a GitHub issue (`gh issue create`) titled "Data discrepancy: <source> <metric> <fips>" with the table row + upstream URL + timestamp. Do not silently overwrite.
4. Update `Last verified: YYYY-MM-DD` to the actual run date in `DATA_SOURCES.md` (overwriting Slice 1's placeholder).
5. Re-run `npm run transform` so `manifest.json` picks up the new `lastVerified` per source.

**Checkpoint:**
- `manifest.json` shows `lastVerified` populated for all six sources within the past 7 days.
- `docs/verification/2026-05-spot-check.md` is committed.
- Any discrepancies are tracked as open GitHub issues, not as silent data mutations.

---

## Cross-slice notes

- **Branch model:** each slice is a separate PR off `main`. Per `CLAUDE.md`: never commit to `main`; PR base is `main`; conventional commit prefixes (`feat:`, `data:`, `docs:`, `test:`).
- **Commit size:** Slice 4 and Slice 5 will produce large data-file diffs (regenerated county JSONs). Split into one commit for the code change, one `data:` commit for the regenerated outputs.
- **Type discipline:** every new field on shared types is optional or carries a sentinel literal (e.g. `aggregation: 'in-repo county sum'`); existing readers continue to compile.
- **No backwards-compat shims:** per `CLAUDE.md`, change call sites rather than alias old types.

## Next
**Phase:** Implement
**Artifact to review:** `docs/crispy/validate-public-data/5-plan.md`
**Action:** Review structure and key decisions — this is a spot-check document. Then invoke `crispy-implement` with project name `validate-public-data`.
