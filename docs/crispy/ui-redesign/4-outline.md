# Outline

Eight vertical slices. Each is one PR, lands behind a green CI gate, and is independently visible in the deployed Cloudflare Pages preview.

## Slice 1 — CI gate, ESLint flat config, bundle-size budget

**Goal:** A push to any branch runs typecheck → lint → test → build → bundle-size on `web/`, `shared/`, `scripts/`, and fails red on any regression. ESLint becomes runnable.

**Components:**
- `.github/workflows/ci.yml` — `on: [push, pull_request]`; matrix-free; `node-version: 24`; jobs: install → typecheck → lint → test → build → check-bundle-size
- `eslint.config.js` (flat) at repo root — `@typescript-eslint`, `react`, `react-hooks`, ignores for `claude_design/`, `**/dist/**`, `web/public/data/**`
- `scripts/check-bundle-size.ts` — reads `web/dist/assets/*.js`, gzips each, fails if any chunk > 500 kB gz; prints a sorted manifest
- Root `package.json` script `check-bundle-size`

**Checkpoint:** Open a no-op PR. CI runs all five jobs green. `npm run lint` passes locally with the new flat config. Bundle-size check prints `current largest: X kB / budget 500 kB` and exits 0.

## Slice 2 — Design-token bridge, fonts, app shell

**Goal:** `tokens.css` is the source of truth; Tailwind utilities resolve to its variables; three Google Fonts ship as `@fontsource` packages; `Layout` / `SiteHeader` / `SiteFooter` / `Container` / `Card` / `JurisdictionBadge` / `SectionHeader` / `Source` are ported and used by the (still-unchanged) Home/County/Compare pages without visual regression beyond the new typography and palette.

**Components:**
- `web/src/styles/tokens.css` (copied from `claude_design/tokens.css`, with the Google Fonts `@import` removed)
- `web/src/main.tsx` — adds `@fontsource/inter`, `@fontsource/source-serif-4`, `@fontsource/jetbrains-mono` imports
- `web/tailwind.config.ts` — `theme.extend` populated with `colors`, `fontFamily`, `fontSize`, `spacing`, `borderRadius`, `boxShadow`, `maxWidth` resolving to `var(--*)`
- `web/src/components/{Layout,SiteHeader,SiteFooter,Container,Card,JurisdictionBadge,SectionHeader,Source}.tsx` — each <150 LOC, Tailwind-class-driven, props match prototype shapes from research §15
- `web/src/components/MetricCard.tsx` — expanded props `{ label, value, change?, changeLabel?, sub?, source?, health? }` (replaces existing 28-line file)
- `DESIGN_SYSTEM.md` — single-line patch noting `Container` max width is **1280**, not 1200

**Checkpoint:** `npm run build` succeeds; visiting `/` and `/county/11001` in `npm run dev` renders with Source Serif headings, Inter body, the warm paper background, and gold focus rings. No new console errors. Bundle-size budget still under 500 kB gz.

## Slice 3 — Transform-side metrics: market health, affordability, property tax, population

**Goal:** Every committed `web/public/data/counties/*.json` carries `current.marketHealthScore`, `current.affordabilityIndex`, top-level `population`, and top-level `propertyTaxRate`, computed from real upstream data with no invented values.

**Components:**
- `shared/src/types.ts` — add `propertyTaxRate?: number` to `CountySummary`; types for `marketHealthScore` and `affordabilityIndex` already exist
- `scripts/transform/marketHealth.ts` — pure function `(snapshot, inventoryYoY) => number | undefined`, weighted composite per Design §5
- `scripts/transform/affordability.ts` — pure function `(medianSalePrice, propertyTaxRate, medianHouseholdIncome, mortgageRate) => number | undefined`, monthly PITI ratio per Design §5
- `scripts/lib/property-tax-rates.ts` — static lookup table sourced from county records (committed; cited in code comments) — only honest path; alternative is to leave field undefined
- `scripts/lib/populations.ts` — Census ACS 5-year `B01003_001E` lookup, already-ingested data
- `scripts/transform/build-county-pages.ts` — wire the four new fields; preserve "warn and skip" on missing inputs
- `scripts/transform/marketHealth.test.ts`, `scripts/transform/affordability.test.ts` — Vitest unit tests for the formulas

**Checkpoint:** `npm run transform --workspace=scripts` regenerates all 21 county JSONs. `jq '.current.marketHealthScore' web/public/data/counties/24031.json` returns a number 0–100. Sparse counties (24510, 51600) emit a `warn` log and skip the field rather than producing nonsense. Tests green.

## Slice 4 — Home page (everything except the map)

**Goal:** `/` renders the new hero, 5-up `MetricStrip`, "Biggest movers" gainers/losers cards, and "What's driving the market" 4-card grid against real `CountySummary` data. The choropleth slot is a labeled placeholder until Slice 5.

**Components:**
- `web/src/pages/Home.tsx` — composes `<Hero />`, `<MetricStrip />`, `<BiggestMovers />`, `<WhatsDriving />`, `<ChoroplethMap />` placeholder
- `web/src/components/home/{Hero,MetricStrip,HealthCard,BiggestMovers,MoversCard,WhatsDriving,DriverCard}.tsx` — each <150 LOC
- `web/src/lib/metro.ts` — derives metro-level snapshot (median sale price, mortgage rate, active listings, DOM, market health) from per-county JSONs + the existing `metrics/mortgage-rates.json`
- `web/src/api.ts` — add `getMortgageRates()` returning `MetricSeries`
- `web/src/components/home/Home.test.tsx` — smoke test: query mock returns 21 counties → `BiggestMovers` shows top-5 / bottom-5

**Checkpoint:** `/` renders end-to-end with no missing fields, no console errors. Baltimore City (24510) and Fairfax City (51600) appear in `BiggestMovers` if they have `zhviYoY`; absent in cards that need fields they lack. Lighthouse a11y score ≥95.

## Slice 5 — MapLibre choropleth + GeoJSON pipeline

**Goal:** The Home choropleth slot renders a real MapLibre map of all 21 jurisdictions, color-encoded by a metric switcher (`zhviYoY`, `zhvi`, `marketHealthScore`, `daysOnMarket`, `monthsSupply`), with hover side-panel and click-to-navigate.

**Components:**
- `scripts/prep-geojson.ts` — fetches Census TIGER counties for DC/MD/VA, filters to the 21 DMV FIPS, simplifies to ~50 KB, writes `web/public/data/geo/dmv-counties.geojson`
- `web/src/components/ChoroplethMap.tsx` — replaces the 22-line stub; loads GeoJSON; metric switcher pills; legend bar; right-rail hover detail; click → `navigate('/county/' + fips)`
- `web/src/lib/map-style.ts` — MapLibre style JSON: free OSM raster basemap + `dmv-counties` source + `fill` layer with `interpolate` paint expressions per metric
- `web/src/lib/color-scales.ts` — replaces unused `colors.ts`; ramps mirror prototype's `colorFor` (8-stop diverging for YoY, 6-stop sequential for value/dom/supply, 4-bucket categorical for health)

**Checkpoint:** `/` shows the choropleth with all 21 jurisdictions visible (some tiny). Switching metrics updates colors in <100ms. Clicking Loudoun navigates to `/county/51107`. Bundle stays under 500 kB gz (will require lazy-loading MapLibre via `React.lazy` if needed).

## Slice 6 — County page rewrite

**Goal:** `/county/:fips` renders the prototype's six-section layout (header, 6-up snapshot, BigChart, Affordability + MarketHealthBreakdown row, ForecastCone, FederalExposure) against real data, with "Insufficient data" empty states for fields that aren't ingested yet.

**Components:**
- `web/src/pages/County.tsx` — orchestrates fetch + layout, <150 LOC
- `web/src/components/county/{CountyHeader,SnapshotGrid,BigChart,Affordability,MarketHealthBreakdown,ForecastCone,FederalExposure,InsufficientData}.tsx` — each <150 LOC
- `web/src/lib/affordability-calc.ts` — client-side calculator (income/down/rate sliders → monthly PITI), reused by the Affordability section
- `web/src/components/county/County.test.tsx` — smoke test: full county (`24031`) renders all sections; sparse county (`24510`) renders header + snapshot subset + 5×`<InsufficientData />` placeholders

**Checkpoint:** `/county/24031` shows all six sections with real numbers. `/county/24510` (Baltimore City, sparse) renders without crashing and surfaces empty states. `BigChart` overlay chips toggle in <50ms. Forecast/Federal sections show "Insufficient data" until those ingests land.

## Slice 7 — Compare page with URL state

**Goal:** `/compare?counties=24031,24027,11001,51107&metric=zhvi` round-trips: opening the URL hydrates selection, toggling counties/metric writes back to the URL, refresh reproduces the exact view.

**Components:**
- `web/src/pages/Compare.tsx` — replaces 23-line stub
- `web/src/components/compare/{CountyPicker,MetricPicker,CompareChart,RankedTable,DifferenceCallout,EmptyState}.tsx` — each <150 LOC
- `web/src/hooks/useCompareState.ts` — wraps `useSearchParams`; exposes `{ selected: Fips[]; metric: CompareMetricId; toggle(fips); setMetric(id) }`; cap at 5; whitelisted metric IDs
- `web/src/lib/compare-metrics.ts` — the 6-metric registry from prototype (`COMPARE_METRICS`)
- `web/src/hooks/useCompareState.test.ts` — Vitest with `MemoryRouter`: load URL → state, toggle → URL, cap-at-5

**Checkpoint:** Picking 4 counties + switching metric updates the URL on every interaction. Pasting the URL into a new tab restores the exact view. `DifferenceCallout` flips to gold when spread thresholds (Design §5 + research Q34) trip.

## Slice 8 — `/counties` index and `/methodology` static page

**Goal:** All four nav items in the header lead to a real route. `/counties` is a searchable A–Z grid of all 21 jurisdictions grouped by DC/MD/VA. `/methodology` is a static markdown-derived page sourced from `claude_design/uploads/`.

**Components:**
- `web/src/pages/Counties.tsx` — search-filterable grid (FIPS + short name + jurisdiction badge), groups by jurisdiction
- `web/src/pages/Methodology.tsx` — renders MDX or pre-built HTML from `claude_design/uploads/02-DATA_MODEL.md` and `04-DMV_CONTEXT.md`
- `web/src/App.tsx` — adds `/counties` and `/methodology` routes
- `web/src/components/SiteHeader.tsx` — `aria-current="page"` wiring for all four nav items

**Checkpoint:** Every header nav item resolves to a 200 page. `/counties` keyboard search filters in real time. `/methodology` cites every data source listed in `SiteFooter`.

---

## Key Interfaces

Shared contracts between slices. None of these belong to a single slice; later slices depend on the names locking in early.

```ts
// shared/src/types.ts — additive only
interface CountySummary {
  // existing fields …
  population?: number;            // Slice 3
  propertyTaxRate?: number;       // Slice 3
  current: CountyCurrentSnapshot; // marketHealthScore, affordabilityIndex populated in Slice 3
}

// web/src/lib/compare-metrics.ts — Slice 7, consumed by Slice 5's switcher
type CompareMetricId =
  | 'zhvi' | 'medianSalePrice' | 'daysOnMarket'
  | 'monthsSupply' | 'marketHealthScore' | 'affordabilityIndex';

interface CompareMetric {
  id: CompareMetricId;
  label: string;
  unit: string;
  format: (v: number) => string;
  get: (c: CountySummary) => number | undefined;
}

// web/src/lib/metro.ts — Slice 4, consumed by Slice 5 legend defaults
interface MetroSnapshot {
  medianSalePrice: number;        medianSalePriceYoY: number;
  mortgageRate: number;           mortgageRateYoY: number;
  activeListings: number;         activeListingsYoY: number;
  daysOnMarket: number;           marketHealth: number;
  lastUpdated: string;
}

// web/src/hooks/useCompareState.ts — Slice 7
interface CompareState {
  selected: string[];             // FIPS, max 5
  metric: CompareMetricId;
  toggle: (fips: string) => void;
  setMetric: (id: CompareMetricId) => void;
}

// scripts/transform/marketHealth.ts — Slice 3
function marketHealthScore(input: {
  monthsSupply?: number;
  saleToListRatio?: number;
  pctSoldAboveList?: number;
  inventoryYoY?: number;
}): number | undefined;

// scripts/transform/affordability.ts — Slice 3
function affordabilityIndex(input: {
  medianSalePrice?: number;
  propertyTaxRate?: number;
  medianHouseholdIncome?: number;
  mortgageRate: number;       // national, 30y fixed
}): number | undefined;
```

## Next
**Phase:** Plan
**Artifact to review:** `docs/crispy/ui-redesign/4-outline.md`
**Action:** Review the vertical slices and checkpoints. Then invoke `crispy-plan` with project name `ui-redesign`.
