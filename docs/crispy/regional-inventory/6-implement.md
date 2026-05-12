# Implementation Log

All seven slices completed and verified. The plan held up well; two material deviations are noted inline.

---

## Slice 1: Fix Redfin pipeline data quality — PASS

**Done:**
- `scripts/ingest/redfin.ts` — `parseRow` now rejects all rows where `PERIOD_DURATION !== '30'` (drops weekly observations across all 11 mapped Redfin metrics, not just inventory).
- `buildFipsIndex` rewritten to key on `${stateCode}:${countyName}` instead of just county name, and gained an explicit alias for the published Redfin name `Baltimore City County, MD` → `24510`.
- `scripts/ingest/redfin.test.ts` — switched `baseRow()` default to a monthly row, added the weekly-rejection test, two Baltimore-city alias tests, and two state-collision regression tests.

**Deviation from plan (significant — material):** the plan called the FIPS-index change a "1-line" suffix-strip extension. In practice it required a full refactor for two reasons surfaced only after re-running ingest:

1. Redfin actually publishes Baltimore city as `Baltimore City County, MD` — neither the existing ` city` strip nor a `Baltimore, MD` short-form alias matches it. Required an explicit override.
2. The original name-only FIPS index was silently collapsing `Montgomery County, VA` (FIPS 51121, not in DMV) onto MD's `24031`, doubling Redfin observations and producing the anomalous `153` value Slice 1 was supposed to fix. Same collision applied to Frederick County (VA 51079 vs MD 24021). Fixing the data quality issue therefore required moving to a `(state_code, county_name)` keyed index — the original plan's framing was incomplete.

**Checkpoint result:** Re-ingest produced 155,518 observations (down from 160,436 — the difference is the weekly rows no longer kept). Re-transform yielded `series.activeListings` for `24510` (1st time ever, 171 monthly observations), Montgomery latest = 1858 (was 153), Frederick latest = 624 with consistent earlier values. All 11 redfin tests pass; typecheck + lint green.

---

## Slice 2: Property-type breakdown in CountySeries — PASS

**Done:**
- `shared/src/types.ts` — added `ActiveListingsByType` and `ActiveListingsBreakdown` interfaces; `CountySeries.activeListings` now returns the breakdown shape.
- `scripts/transform/build-county-pages.ts` — exported new `buildActiveListingsBreakdown(forCounty)` helper, replaced the single-pass `activeObs` filter, and updated the dedup key to include `series` only for `metric === 'active_listings'` (other Redfin metrics still collapse to `all_residential` via the existing sort).
- `scripts/transform/build-county-pages.test.ts` (new file) — six test cases covering total = sum of types, dropped-date gating, missing-multi-family-as-zero behavior, chronological ordering, and `all_residential` rows being ignored.
- `web/src/lib/compare-metrics.ts` — narrowed `seriesKey` to a `FlatSeriesKey` type (only `MetricPoint[]`-typed `CountySeries` fields) so `CompareChart` doesn't try to iterate the structured `ActiveListingsBreakdown`.

**Deviation from plan (significant — design):** the plan's gating rule was "all four property types must report" for a date to land in the breakdown. Empirically that produced 0 covered months for several large counties (Calvert, Fairfax, Loudoun) because Redfin omits multi-family rows entirely when there are no listings of that type. Switched to:

- `REQUIRED_TYPES = ['single_family', 'condo', 'townhouse']` — gate on these only; missing any drops the date.
- Multi-family treated as `0` when missing (matches Redfin's "row omitted means zero listings of this type" convention).

This change is documented in code comments on `buildActiveListingsBreakdown` and reflected in the new "treats missing multi_family as zero" test case.

**Checkpoint result:** DC's `series.activeListings.total[i].value === sum(byType[*][i].value)` for every index. 6 unit tests pass; full suite 97 + 15 = 112 tests pass.

---

## Slice 3: DMV regional aggregate JSON — PASS

**Done:**
- `shared/src/types.ts` — added `ActiveListingsDmv` interface.
- `scripts/transform/build-county-pages.ts` — new aggregator block summing per-county breakdowns into `web/public/data/metrics/active-listings-dmv.json`. Sources from in-memory `observations` (computes per-county breakdowns inline) rather than reading per-county JSONs back from disk — simpler dependency graph.

**Deviation from plan (significant — design):** the plan called for "all covered counties must report each month" gating. With the per-county breakdown's coverage variance (DC has 171 months; Spotsylvania 20; Charles 110; Manassas Park 120), strict gating produced only 3 months of regional total. Introduced a `COVERAGE_RATIO_THRESHOLD = 0.95` filter: counties whose breakdown spans <95% of the longest coverage are excluded from `coverage.fips` and listed in `coverage.missing`. Result: 14 counties contribute, 7 are documented as missing (`24009`, `24017`, `51177`, `51179`, `51600`, `51610`, `51685`), and the regional series spans 170 monthly observations.

**Checkpoint result:** `metrics/active-listings-dmv.json` contains 170 monthly points from `2012-01-31` through `2026-03-31`. Latest total = 16,882 (single_family 6,268 / townhouse 6,145 / condo 4,225 / multi_family 244), `latestYoY ≈ 0.0588`, `coverage.fips.length === 14`, `coverage.missing` lists all seven excluded FIPS. The seasonal pattern looks correct (peaks May–Sep, troughs Dec).

---

## Slice 4: Home page stacked-area inventory chart — PASS (browser verification deferred)

**Done:**
- `web/src/api.ts` — added `getActiveListingsDmv` and pulled the `ActiveListingsDmv` type alongside existing imports.
- `web/src/components/home/InventoryChart.tsx` (new) — stacked `AreaChart` with four `<Area stackId="a">` layers in order single_family → townhouse → condo → multi_family. Custom palette: `#A4243B / #C66B4F / #D9A05B / #7B3E2A`. Tooltip shows the four type labels plus a localized month/year label. Title is dynamically derived (`"DMV listings up X% YoY"`, etc.). Source string: `"Redfin · DMV total · 14 counties · as of 2026-03-31"`.
- `web/src/components/home/WhatsDriving.tsx` — accepts new optional `inventory` prop; renders `<InventoryChart>` when present, falls back to "Inventory data unavailable" copy when undefined.
- `web/src/pages/Home.tsx` — adds a `useQuery` for `getActiveListingsDmv` and passes the data into `<WhatsDriving>`.

**Checkpoint result:** typecheck + lint + 112 tests pass. Production build succeeds. Live browser verification (stacked-area visual, tooltip behavior, narrow-width legend behavior) is deferred to the user — I can't drive a browser from here.

---

## Slice 5: Fix MetricStrip activeListingsYoY — PASS (browser verification deferred)

**Done:**
- `web/src/lib/metro.ts` — `deriveMetroSnapshot()` gains an optional third arg `inventory?: ActiveListingsDmv`. Both `activeListings` and `activeListingsYoY` now read from `inventory.latest.total` and `inventory.latestYoY` respectively. The buggy `median(salePriceYoYs)` and the per-county client-side sum are gone.
- `web/src/pages/Home.tsx` — passes `inventoryResult.data` into `deriveMetroSnapshot()`.

**Checkpoint result:** typecheck + lint + tests pass. Browser verification of arrow-direction parity between the tile and the chart callout deferred to user.

---

## Slice 6: County page inventory chart (last section) — PASS (browser verification deferred)

**Done:**
- `web/src/components/county/CountyInventory.tsx` (new) — same stacked-area pattern as `InventoryChart`, sized to match `FederalEmploymentChart` (h≈280, year-only x-ticks every other year). Renders `InsufficientData` with eyebrow "Active inventory" when `summary.series.activeListings` is undefined (covers `51600` Fairfax city). Includes a static color legend below the chart.
- `web/src/pages/County.tsx` — adds `<CountyInventory>` as the **last** section after the federal employment chart.

**Deviation from plan:** the plan suggested using `Array.prototype.findLast`. Web's tsconfig targets ES2022 (no `findLast`). Replaced with a reverse-loop equivalent. Scripts uses ES2023 which has `findLast`, so the build-county-pages and shared types still use it.

**Checkpoint result:** typecheck + lint + 112 tests pass. Production build succeeds.

---

## Slice 7: Wire inventoryYoY into Market Health — PASS

**Done:**
- `shared/src/types.ts` — added `activeListings?: number` and `activeListingsYoY?: number` to `CountyCurrentSnapshot`.
- `scripts/transform/build-county-pages.ts` — computes `inventoryYoY` off `breakdown.total`, surfaces both fields on `summary.current`, and passes `inventoryYoY` into `marketHealthScore({...})`.
- `web/src/components/county/MarketHealthBreakdown.tsx` — added a 4th sub-score branch using `current.activeListingsYoY` with the same formula as `marketHealth.ts` (`70 - inventoryYoY * 100`, clamped 0–100, weight 25). Updated the caption to include "inventory YoY".

**No deviation from plan.** `marketHealth.ts` already accepted `inventoryYoY` as a parameter — the deficit was purely wiring.

**Checkpoint result:** Each published county JSON now carries `current.activeListings` and `current.activeListingsYoY`. Spot-check: DC `marketHealthScore = 50, activeListings = 2755, activeListingsYoY = -0.046`; Montgomery `66, 1856, +0.122`; Fairfax `76, 1784, +0.041`; Baltimore city `54, 2547, +0.077`. All scores shifted from the pre-Slice-7 baseline, as expected. typecheck + lint + tests + production build all green.

---

## Summary

- **All 7 slices passed their checkpoints.** No slices stopped at a failure.
- **Three material design-level deviations** surfaced during execution and are documented above:
  1. Slice 1's FIPS-index refactor is broader than "1 line" — added state-keyed lookup to fix VA→MD collisions surfaced empirically.
  2. Slice 2's gating rule changed: required types are SFH/condo/townhouse only; multi-family is treated as zero when missing.
  3. Slice 3's coverage rule added a 95% density threshold so counties with sparse breakdown coverage don't gate the whole regional series.
- **Test coverage:** redfin (11), build-county-pages breakdown (6), marketHealth (4 — unchanged), web (15) — all pass; full suite is 112 tests.
- **Browser-side visual verification** for Slices 4, 5, 6 (stacked-area rendering, tooltip behavior at narrow widths, legend layout, MetricStrip arrow parity, County page last-section spacing) is deferred to the user.
- **The Compare page** had a typecheck side-effect from Slice 2's `CountySeries` shape change; resolved by narrowing `CompareMetric.seriesKey` to a `FlatSeriesKey` type (excludes the structured `activeListings` field).

## Next
**Phase:** Delivery
**Artifact to review:** `docs/crispy/regional-inventory/6-implement.md`
**Action:** Review the implementation log. Then invoke `crispy-delivery` with project name `regional-inventory`.
