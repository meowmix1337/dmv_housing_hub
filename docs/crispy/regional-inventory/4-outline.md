# Outline

Seven vertical slices. Each is independently verifiable end-to-end (cache → transform → published JSON → UI where relevant). Slices 1 and 2 are pure data-layer; slices 3–7 each bring a piece of the user-visible feature online.

---

## Slice 1: Data-quality fix in the Redfin pipeline

**Goal:** Per-county `series.activeListings` in published `web/public/data/counties/*.json` reflects monthly Redfin values only, with no anomalous numbers, and Baltimore city `24510` is populated.

**Components:**
- `scripts/ingest/redfin.ts` — extend `buildFipsIndex()` so MD independent cities (`24510 Baltimore city`) match without the ` city` suffix; same one-line treatment already applied to VA cities.
- `scripts/ingest/redfin.ts:62-63` — drop weekly rows (`PERIOD_DURATION === '7'`) for `active_listings`/`new_listings`/`months_supply` (or unconditionally — confirm during impl that no other consumer needs the weekly rows).
- `scripts/ingest/redfin.test.ts` — add cases for the Baltimore-city name match and weekly-row exclusion.

**Checkpoint:** Re-run `npm run ingest:redfin --workspace=scripts && npm run transform --workspace=scripts`. Verify: (a) `web/public/data/counties/24510.json` exists and has populated `series.activeListings`; (b) Montgomery `24031` latest value is in the low thousands, not 153; (c) Frederick `24021` MoM σ over the last 24 months is single-digit-percent. Rerun `npm run typecheck && npm run lint && npm run test`.

---

## Slice 2: Property-type breakdown in CountySeries

**Goal:** Each `web/public/data/counties/{fips}.json` carries `activeListings` as `{ total, byType: { single_family, condo, townhouse, multi_family } }` instead of a flat `MetricPoint[]`.

**Components:**
- `shared/src/types.ts` — replace `activeListings?: MetricPoint[]` on `CountySeries` with `activeListings?: ActiveListingsBreakdown` (see Key Interfaces below). Keep all other fields untouched.
- `scripts/transform/build-county-pages.ts` — replace the single-pass dedup for `active_listings` with a per-property-type pass that produces all four type series; compute `total` as the sum of the four types at each date (not from `redfin:county:all_residential`, per design).
- `scripts/transform/build-county-pages.test.ts` (new or extended) — fixture covering one county with all four types reporting and one with a missing type for some months.

**Checkpoint:** A spot-checked county JSON (e.g. `11001.json`) shows `series.activeListings.total` and four `byType.*` arrays of equal length. `series.activeListings.total[i].value === sum(byType[*][i].value)` for every index. `npm run typecheck && npm run test`.

---

## Slice 3: DMV regional aggregate JSON

**Goal:** `web/public/data/metrics/active-listings-dmv.json` is published with monthly total + per-type breakdown + latest scalar + latest YoY, summed across the 20 covered DMV FIPS, gated on full coverage per month.

**Components:**
- `scripts/transform/build-county-pages.ts` — new helper alongside the existing `federal-employment-dmv.json` block (~`:354-388`). Iterates all DMV counties; for each month emit `{ date, total, byType }` only when every covered county reports that month; compute latest + YoY off the gated series.
- `web/public/data/metrics/active-listings-dmv.json` — output artifact. Shape mirrors the per-county shape plus `latest`, `latestYoY`, `asOf`, `coverage` fields (see Key Interfaces).
- Test in `build-county-pages.test.ts` covering: (a) full coverage emits a row, (b) one county missing skips that month, (c) YoY computed against the same month one year prior.

**Checkpoint:** File exists; `latest.total` is in the low-to-mid teens of thousands; `coverage.fips.length === 20`; `coverage.missing === ['51600']`. Visually inspect the last 36 monthly totals — should match the DMV-total range from research (`~10K–20K`).

---

## Slice 4: Home page stacked-area inventory chart

**Goal:** The "Regional inventory chart coming soon" placeholder in `WhatsDriving.tsx` is replaced by a stacked `AreaChart` driven by the new aggregate JSON.

**Components:**
- `web/src/api.ts` — add `getActiveListingsDmv(): Promise<ActiveListingsDmv>` and the `ActiveListingsDmv` interface.
- `web/src/components/home/InventoryChart.tsx` (new) — stacked `<AreaChart>` with four `<Area stackId="a">` layers (SFH bottom, then condo, townhouse, multi-family), Recharts `Tooltip` configured to render all four type values plus running total, static legend. Dynamic title derived from `latestYoY` (e.g. `"DMV listings flat YoY"` / `"DMV listings up 18% YoY"`). Source string `Redfin · DMV total · 20 counties · as of ${asOf}`.
- `web/src/components/home/WhatsDriving.tsx` — replace the placeholder card (lines 138–147) with `<InventoryChart data={...} />`. Add `inventory` prop fed in from `Home.tsx`.
- `web/src/pages/Home.tsx` — add a `useQuery` for `getActiveListingsDmv` and plumb it into `<WhatsDriving>`.
- Tests: `InventoryChart.test.tsx` (renders with sample data, no a11y warnings); `Home.test.tsx` updated to mock the new endpoint.

**Checkpoint:** `npm run dev`, load `/`, verify the stacked area renders with four colors, hover tooltip shows all four type values + total, source line cites Redfin and the data date. Title text reflects real YoY direction.

---

## Slice 5: Fix MetricStrip "Active listings" YoY

**Goal:** The home-page MetricStrip "Active listings" tile shows a correct ▲/▼ percent driven by the aggregate JSON's `latestYoY`, not `median(salePriceYoYs)`.

**Components:**
- `web/src/lib/metro.ts` — change `deriveMetroSnapshot()` signature to accept the `ActiveListingsDmv` aggregate; replace the buggy `activeListingsYoY: median(salePriceYoYs)` line with `aggregate.latestYoY`. Replace the `activeListings` total with `aggregate.latest.total` so the tile shows the same number as the chart's headline rather than a client-side sum.
- `web/src/pages/Home.tsx` — pass the aggregate into `deriveMetroSnapshot()`.
- `web/src/lib/metro.test.ts` (if it exists) and `Home.test.tsx` — update fixtures.

**Checkpoint:** Tile shows the same number as the chart callout; YoY arrow direction matches chart title. `npm run typecheck && npm run lint && npm run test`.

---

## Slice 6: County page inventory chart

**Goal:** The County page (`/county/:fips`) has a stacked-area inventory chart as its **last section**, fed by the per-county breakdown from Slice 2.

**Components:**
- `web/src/components/county/CountyInventory.tsx` (new) — same stacked-area component pattern as `InventoryChart.tsx` but smaller dimensions and a current-tile + chart layout consistent with how the County page presents `medianSalePrice` and `daysOnMarket`. Uses `InsufficientData` placeholder when `series.activeListings` is missing (covers `51600 Fairfax city`).
- `web/src/pages/County.tsx` — append `<CountyInventory county={summary} />` after all existing sections.
- `County.test.tsx` — add cases for both populated and empty inventory.

**Checkpoint:** Load `/county/11001` → stacked area renders at the bottom of the page with DC's data. Load `/county/51600` → InsufficientData placeholder renders cleanly. `npm run test`.

---

## Slice 7: Market Health composite reweight

**Goal:** `marketHealthScore` includes inventory YoY at 20%, matching `PROJECT_SPEC.md:203`. The `MarketHealthBreakdown` card on the County page renders four sub-scores instead of three.

**Components:**
- `scripts/transform/marketHealth.ts` — add `inventoryYoY` input; weights become `monthsSupply 30 / saleToListRatio 25 / pctSoldAboveList 20 / inventoryYoY 20` (sums to 95 — keep that 5% slot for `pct_price_drops` when it lands; document in a code comment). Score-from-YoY function: ≤−20% → 100 (shrinking supply = tight market), ≥+20% → 0, linear between.
- `scripts/transform/marketHealth.test.ts` — extend with cases covering the new input.
- `scripts/transform/build-county-pages.ts:259-263` — pass `inventoryYoY` (computed off the new breakdown's `total` series) into `marketHealthScore`.
- `web/src/components/county/MarketHealthBreakdown.tsx:9-18` — append a 4th sub-score ("Inventory YoY") to `computeSubScores()`. Update the "Composite score · supply, sale-to-list, above-list %" caption (`:81`) to include inventory.
- Snapshot-test or before/after diff for every published county JSON's `marketHealthScore`. Document the score shifts in the PR description.

**Checkpoint:** Every county JSON has both `current.marketHealthScore` and a derivable `inventoryYoY` available to the breakdown. County page shows four sub-bars in the health card. `npm run typecheck && npm run lint && npm run test`.

---

## Key Interfaces

Shared shapes used across slices. Live in `shared/src/types.ts`.

```ts
// Slice 2
export interface ActiveListingsBreakdown {
  total: MetricPoint[];
  byType: {
    single_family: MetricPoint[];
    condo: MetricPoint[];
    townhouse: MetricPoint[];
    multi_family: MetricPoint[];
  };
}

// Replaces existing line on CountySeries
activeListings?: ActiveListingsBreakdown;

// Slice 3 — published as web/public/data/metrics/active-listings-dmv.json
export interface ActiveListingsDmv {
  metric: 'active_listings';
  fips: 'DMV';
  unit: 'count';
  cadence: 'monthly';
  source: 'redfin';
  lastUpdated: string;          // ISO timestamp of the transform run
  asOf: string;                 // YYYY-MM-DD of latest covered month
  latest: { total: number; byType: ActiveListingsBreakdown['byType'] extends infer B
              ? { [K in keyof B]: number } : never };
  latestYoY: number | undefined; // decimal (0.18 = +18%), undefined when <12 months
  series: ActiveListingsBreakdown;
  coverage: { fips: string[]; missing: string[] };
}
```

Slice ordering invariants:
- Slice 1 must land before Slice 2 (the dedup change makes Slice 2's per-type pass produce sane numbers).
- Slice 2 must land before Slices 3, 6, 7 (they all consume the breakdown).
- Slice 3 must land before Slices 4 and 5 (they consume `active-listings-dmv.json`).
- Slices 4–7 are independent of each other; can be parallelized or merged into a single PR per project convention (one feature per PR).

## Next
**Phase:** Plan
**Artifact to review:** `docs/crispy/regional-inventory/4-outline.md`
**Action:** Review the vertical slices and checkpoints. Then invoke `crispy-plan` with project name `regional-inventory`.
