# Outline

Four vertical slices, each end-to-end and independently verifiable. Each slice merges to `main` as its own PR (per `CLAUDE.md`: "one feature per PR; ~200–300 lines of changes per commit").

## Key Interfaces (shared contracts)

```ts
// shared/src/types.ts — schema deltas (Slice 1 lands these; later slices read them)
interface CountyCurrentSnapshot {
  // …existing fields…
  federalEmployment?: number;          // latest disclosed quarterly count
  federalEmploymentYoY?: number;       // decimal vs same quarter prior year
  federalEmploymentAsOf?: string;      // ISO date (month-3 of quarter, e.g. "2024-12-01")
}
interface CountySeries {
  // …existing fields…
  federalEmployment?: MetricPoint[];   // chronological quarterly points
}
```

```ts
// Observation contract from QCEW ingester (already typed via shared Observation)
{
  source: 'qcew',
  series: `qcew:${fips}:${year}Q${qtr}:own1:naics10`, // composite citation key
  fips,                                                // 5-digit county FIPS
  metric: 'federal_employment',
  observedAt: `${year}-${pad2(monthOfQ3)}-01`,         // Q1→03-01, Q2→06-01, Q3→09-01, Q4→12-01
  value: month3_emplvl,                                 // number, finite
  unit: 'count',
}
```

```ts
// scripts/ingest/qcew.ts internal contract
async function fetchAreaSlice(fips: string, year: number, qtr: 1|2|3|4): Promise<QcewRow[]>
function selectFederalCountyTotal(rows: QcewRow[]): QcewRow | null  // own=1, agglvl=71, industry=10
function rowToObservation(row: QcewRow): Observation | null         // null if disclosure_code='N' or non-finite
```

---

## Slice 1 — Ingester produces valid `qcew.json` cache

**Goal:** Run `npm run ingest:qcew --workspace=scripts` and produce `scripts/.cache/qcew.json` containing one `Observation` per (DMV county × disclosed quarter) from 2015 → present.

**Components:**
- `shared/src/types.ts` — add the four optional fields above; bump nothing else.
- `scripts/ingest/qcew.ts` — new file:
  - `class QcewSource implements DataSource` with `name='qcew'`, `cadence='quarterly'`.
  - `fetchAreaSlice(fips, year, qtr)` using `fetchWithRetry` (label `qcew:${fips}:${year}Q${qtr}`).
  - CSV parsing via `csv-parse/sync` (already a transitive dep).
  - Bounded concurrency pool of 4 (~30 lines, no new dep).
  - Row filter: `own_code==='1' && agglvl_code==='71' && industry_code==='10'`.
  - `disclosure_code==='N'` or non-finite `month3_emplvl` → `log.warn`, skip.
  - `IngestError` with `source: 'qcew'` for hard failures.
- `scripts/ingest/run.ts` — register `QcewSource` in source registry.
- `scripts/package.json` — add `"ingest:qcew": "tsx scripts/ingest/run.ts --source=qcew"` (matching siblings).
- Unit test `scripts/ingest/qcew.test.ts` — feed three fixture CSV strings (disclosed row, suppressed row, malformed row) into a pure parse function; assert one valid `Observation` and two warnings.

**Checkpoint:**
1. `npm run typecheck` clean across all workspaces.
2. `npm run test --workspace=scripts -- qcew` passes.
3. `npm run ingest:qcew --workspace=scripts` produces `scripts/.cache/qcew.json` whose envelope passes `CachedRunMetaSchema` and whose `observations.length` ≈ `21 counties × 4 quarters × ~10 years` (~840). Spot-check: DC Q1 2024 row's `value` matches research §Q11 table (`192845`).

---

## Slice 2 — Transform writes `federalEmployment*` into county JSONs and manifest

**Goal:** Re-running `npm run transform --workspace=scripts` after Slice 1 writes the four new fields into all 21 `web/public/data/counties/{fips}.json` files and adds a `qcew` entry to `manifest.json`.

**Components:**
- `scripts/transform/build-county-pages.ts`:
  - Add `'qcew'` to `SOURCES` tuple (`:46`).
  - Add `case 'qcew': return 'quarterly';` to `cadenceFor` (`:109`).
  - New helper `buildFederalEmployment(observations: Observation[], fips: string)` returning `{ current, series }` partial — handles "find latest disclosed" + "look back 4 quarters for YoY", returns nullable fields.
  - Wire that helper into the per-county assembly that already builds `current` + `series`.
- DMV-aggregate computation (used by Slice 4): same helper composed across the 21 counties; emit a small `web/public/data/metrics/federal-employment-dmv.json` of shape `{ lastUpdated, total, totalYoY, asOf, series: MetricPoint[] }` (sums across counties per quarter).
- No web changes in this slice.

**Checkpoint:**
1. `npm run transform --workspace=scripts` exits 0; logs include `qcew: parsed N observations`.
2. `jq '.current.federalEmployment, .current.federalEmploymentYoY, .current.federalEmploymentAsOf' web/public/data/counties/11001.json` returns three non-null values.
3. `jq '.series.federalEmployment | length' web/public/data/counties/11001.json` returns ≥ 36 (≥9 yrs × 4 quarters).
4. `jq '.sources[] | select(.name=="qcew")' web/public/data/manifest.json` returns an entry with `cadence: "quarterly"` and a recent `lastUpdated`.
5. `web/public/data/metrics/federal-employment-dmv.json` exists with finite `total` and a non-empty `series`.

---

## Slice 3 — County page surfaces the metric

**Goal:** Visiting `/county/11001` (and any other DMV county) in `npm run dev` shows a "Federal employment" metric card with value + YoY + as-of date, and an entry in the quarterly chart group.

**Components:**
- `web/src/api.ts` — types already widen via Slice 1; verify the typed wrapper still exports a `CountySummary` consumer with no `any`.
- `web/src/pages/County.tsx` (or wherever `MetricCard`s are composed):
  - New `MetricCard` instance bound to `county.current.federalEmployment` / `…YoY` / `…AsOf`.
  - Card label: "Federal employment"; subtitle: "as of {formatDate(asOf)}".
  - Hide YoY line when `federalEmploymentYoY === undefined`; render `—` when value is undefined.
  - Source attribution under the card: "Source: U.S. Bureau of Labor Statistics, Quarterly Census of Employment and Wages."
- `web/src/pages/County.tsx` chart section: add `series.federalEmployment` as a Recharts line/area in the existing quarterly-cadence chart (or its own card if no shared chart exists — match existing per-metric chart pattern).

**Checkpoint:**
1. `npm run typecheck` and `npm run lint` clean.
2. `npm run dev` → visit `/county/11001`: card shows ~192,845 (or whatever is current) with YoY, as-of date in March/June/Sept/Dec.
3. Visit `/county/51685` (Manassas Park, ~25 jobs): card renders the small value without errors or special-case formatting.
4. Visit `/county/24009` (Calvert, ~417 jobs in research): chart line renders with no gaps for the 2015–2024 window.
5. Source attribution string visible.

---

## Slice 4 — Home page DMV-aggregate stat

**Goal:** Visiting `/` shows a "DMV federal jobs" stat block with the latest-quarter sum + YoY, sourced from `metrics/federal-employment-dmv.json`.

**Components:**
- `web/src/api.ts` — add a typed fetch wrapper for `metrics/federal-employment-dmv.json` mirroring the existing `mortgage-rates.json` pattern.
- `web/src/pages/Home.tsx` — add a stat block (matching existing overview stat styling). Show value, YoY, and "as of" date. Source attribution.
- React Query: one extra fetch on Home, parallel to the existing choropleth data fetch.

**Checkpoint:**
1. `npm run typecheck` and `npm run lint` clean.
2. `npm run dev` → visit `/`: DMV stat block renders with a sum that equals the sum of the 21 county `federalEmployment` values from Slice 2.
3. YoY direction matches the Slice 2 DMV JSON (sanity check, not visual-regression).
4. Build artifact: `npm run build` produces `web/dist/` with the new metric JSON included.

---

## Why this slice order

- **Slice 1** is the only one that writes to upstream BLS — get the data flowing first, with a unit-tested parser, before any consumer depends on it.
- **Slice 2** is pure data-shape work; it can be reviewed without any web context and unblocks both UI slices.
- **Slice 3** validates the per-county UX and exercises the suppression/undefined-handling code paths that affect Slice 4.
- **Slice 4** depends on the DMV-aggregate JSON from Slice 2 *and* the visual conventions established in Slice 3.

Any slice can be reverted independently: rolling back Slice 4 leaves county pages working; rolling back Slice 3 leaves data-pipeline outputs intact; rolling back Slice 2 leaves the cache file harmless on disk; rolling back Slice 1 deletes the new file and a few lines of types.

## Two boundary decisions explicitly locked in

1. **DMV-aggregate is computed in Slice 2 (transform-time), not Slice 4 (web-side).** Counties may eventually have different "latest disclosed quarter" if BLS suppresses one in the future. Summing values from mismatched quarters in the browser would silently produce a meaningless total. The transform must align across quarters once, write the result to `metrics/federal-employment-dmv.json`, and let the web read a single authoritative number. Bonus: the aggregate is `jq`-inspectable for verification.
2. **Slice 3 ships card + chart together, not split.** The repo pattern (see existing `zhvi`/`fhfaHpi` surfacing on the County page) pairs every MetricCard with a Recharts trend in the same component group. A card-only intermediate ships a number without context — a reader can't tell whether 192K federal jobs in DC is unusually high or routine without the trendline. If the chart code grows beyond ~100 lines during implementation, the executor may split then; pre-splitting produces a worse intermediate state.

## Next
**Phase:** Plan
**Artifact to review:** `docs/crispy/qcew-federal-employment/4-outline.md`
**Action:** Review the vertical slices and checkpoints. Then invoke `crispy-plan` with project name `qcew-federal-employment`.
