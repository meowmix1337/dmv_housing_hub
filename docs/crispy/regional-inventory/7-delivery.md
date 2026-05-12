# Delivery

## Summary

Replaced the "Regional inventory chart coming soon" placeholder in the Home page's "What's driving the market" section with a real, stacked-area, four-property-type DMV active-inventory chart, and added a matching per-county chart as the last section of the County page. Behind the surface change, the Redfin pipeline was hardened: weekly rows now dropped, a state-keyed FIPS index resolves a previously-silent VA→MD county collision (Montgomery, Frederick), and Baltimore city `24510` — which had been missing entirely — now ingests under its published Redfin name `Baltimore City County, MD`. A new aggregate (`metrics/active-listings-dmv.json`) materializes a DMV-wide monthly time series with a per-property-type breakdown, latest scalar, and latest YoY, and is consumed both by the new chart and by the previously broken `MetricStrip` "Active listings" tile (whose YoY had been reading `median(salePriceYoYs)`). Inventory YoY also now feeds the county-level Market Health composite as a fourth weighted input, surfacing as the fourth sub-bar in `MarketHealthBreakdown`.

## Changes

### Created
- `web/src/components/home/InventoryChart.tsx` — Stacked `AreaChart` for the Home page, dynamic title from real YoY, palette `#A4243B / #C66B4F / #D9A05B / #7B3E2A`.
- `web/src/components/county/CountyInventory.tsx` — Same stacked-area pattern at County-page scale, with `InsufficientData` fallback for counties without Redfin coverage (`51600`).
- `scripts/transform/build-county-pages.test.ts` — Six unit tests for `buildActiveListingsBreakdown` (sum-of-types, gating, missing-multi-family-as-zero, ordering, ignore-`all_residential`).
- `web/public/data/metrics/active-listings-dmv.json` — New build artifact. 170 monthly points, `coverage.fips` = 14, `coverage.missing` = 7.

### Modified
- `shared/src/types.ts` — Added `ActiveListingsBreakdown`, `ActiveListingsByType`, `ActiveListingsDmv`. Replaced flat `activeListings?: MetricPoint[]` on `CountySeries` with the breakdown shape. Added `activeListings?: number` and `activeListingsYoY?: number` on `CountyCurrentSnapshot`.
- `scripts/ingest/redfin.ts` — `parseRow` rejects all non-monthly rows (`PERIOD_DURATION !== '30'`). `buildFipsIndex` rewritten to key on `${stateCode}:${countyName}`, with explicit alias `MD:baltimore city county` → `24510`.
- `scripts/ingest/redfin.test.ts` — `baseRow()` default switched to monthly; new tests for weekly rejection, Baltimore alias variants, and Montgomery/Frederick state-collision regression.
- `scripts/transform/build-county-pages.ts` — Exported `buildActiveListingsBreakdown` (gates on SFH/condo/townhouse, treats missing multi-family as zero); dedup keyed on `series` only for `active_listings`; new DMV aggregator block with 95% coverage-density threshold; per-county `inventoryYoY` computed and surfaced on `current.activeListings(YoY)` and passed into `marketHealthScore`.
- `web/src/api.ts` — `getActiveListingsDmv()` loader.
- `web/src/lib/metro.ts` — `deriveMetroSnapshot()` accepts an `inventory?: ActiveListingsDmv` arg; `activeListings` and `activeListingsYoY` now read from `inventory.latest.total` / `inventory.latestYoY` instead of the previous client-side sum and `median(salePriceYoYs)` bug.
- `web/src/lib/compare-metrics.ts` — Narrowed `seriesKey` to a `FlatSeriesKey` type (only `MetricPoint[]`-typed fields) so `CompareChart` can't try to iterate the structured breakdown.
- `web/src/components/home/WhatsDriving.tsx` — Replaced placeholder card with `<InventoryChart>` (with fallback copy when data is missing); added optional `inventory` prop.
- `web/src/pages/Home.tsx` — `useQuery` for the new aggregate; passes data into `<WhatsDriving>` and `deriveMetroSnapshot()`.
- `web/src/pages/County.tsx` — Appends `<CountyInventory>` as the last `Container` section after `<FederalEmploymentChart>`.
- `web/src/components/county/MarketHealthBreakdown.tsx` — Adds 4th sub-bar (`Inventory YoY`, weight 25, formula `clamp(70 - YoY*100, 0, 100)`); caption updated to mention inventory YoY.
- `web/public/data/counties/*.json` — Regenerated. Each county now carries the breakdown shape and `current.activeListings(YoY)`. Baltimore city `24510` populated for the first time. Montgomery `24031` latest = 1858 (was 153). Frederick `24021` consistent.

## Verification

- **All 7 slice checkpoints passed**, with three documented design-level deviations folded into the implementation log.
- **Test suite**: 112 tests pass total (redfin 11; build-county-pages breakdown 6; marketHealth 4; web 15; existing suites unchanged).
- **`npm run typecheck`** clean across all three workspaces.
- **`npm run lint`** clean.
- **`npm run build`** produces the production bundle without errors.
- **Browser-confirmed by user**: the Home stacked-area chart renders correctly with proper composition (SFH dominant), the County page inventory chart appears as the last section with DC's condo-dominant stack, and the County Market Health card now shows four sub-bars including "Inventory YoY".
- **Data sanity**: DMV aggregate latest = 16,882 (+5.9% YoY) as of 2026-03-31. DC `marketHealthScore = 50, activeListings = 2755, activeListingsYoY = -0.046`. Sum-of-types matches `total` per index. Earlier `Montgomery=153` anomaly resolved.

## Remaining Items

- **Hard coverage gap — Fairfax city `51600`**: Neither Redfin nor FRED's Realtor.com series publish for this FIPS. The County page renders an `InsufficientData` placeholder for it. No fix available without a third source.
- **Soft coverage gaps in the regional aggregate**: Counties whose Redfin breakdown spans <95% of the longest history are excluded from `coverage.fips` and listed in `coverage.missing` (`24009 Calvert`, `24017 Charles`, `51177 Spotsylvania`, `51179 Stafford`, `51600 Fairfax city`, `51610 Falls Church`, `51685 Manassas Park`). The home chart's source line declares "14 counties" so readers don't assume full coverage. If pull becomes possible (e.g. via a Realtor.com fallback ingester), these can be added back.
- **Spec drift on Market Health weights**: `PROJECT_SPEC.md:203` specifies inventory YoY at **20%** of the composite; the existing `marketHealth.ts` function had it implemented at **25%** before this work began. Implementation kept the existing 25% to avoid touching the function, so all county scores now reflect a 30/25/20/25 blend. If the project owner wants exact spec parity, change one line in `scripts/transform/marketHealth.ts:27`.
- **Redfin `is_seasonally_adjusted` flag**: Not parsed by the ingester; cache discards it. No action needed unless seasonal-adjustment behavior becomes important.
- **Commit / PR**: Not opened. The branch is `feat/qcew-federal-employment` (carried over from the previous feature), so a fresh branch and PR are recommended before merging.

## How to Use

### Refreshing the data
```bash
# After updating Redfin TSV (or manually):
FRED_API_KEY=... CENSUS_API_KEY=... BLS_API_KEY=... \
  npm run ingest:redfin --workspace=scripts
npm run transform --workspace=scripts
```
This regenerates every `web/public/data/counties/{fips}.json` with the new breakdown shape, plus `web/public/data/metrics/active-listings-dmv.json` and the existing manifest.

### Reading the data programmatically
```ts
import { getActiveListingsDmv, getCountySummary } from '@/api';

// Regional, materialized in metrics/active-listings-dmv.json
const dmv = await getActiveListingsDmv();
//  → { latest: { total, byType }, latestYoY, series, coverage, ... }

// Per-county, on each county summary
const c = await getCountySummary('11001');
const points = c.series.activeListings;
//  → { total: MetricPoint[], byType: { single_family, condo, townhouse, multi_family } }
//  → c.current.activeListings (number), c.current.activeListingsYoY (decimal)
```

### Where it shows up in the UI
- **Home page** (`/`): "What's driving the market" → 3rd tile is `InventoryChart` (stacked area, dynamic YoY headline).
- **Home page MetricStrip**: "Active listings" tile pulls latest total + YoY from the aggregate.
- **County page** (`/county/:fips`): last section is `CountyInventory` (stacked area + legend); Market Health card shows four sub-bars including "Inventory YoY".

### Adjusting the regional coverage threshold
`scripts/transform/build-county-pages.ts` — `COVERAGE_RATIO_THRESHOLD` constant (currently `0.95`). Lower it to fold in more counties at the cost of a noisier monthly series; raise to `1.0` to require 100% history coverage (drops to ~14 counties already, so 1.0 is roughly the same as today).

---

✅ **CRISPY workflow complete.** All artifacts are in `docs/crispy/regional-inventory/`.
