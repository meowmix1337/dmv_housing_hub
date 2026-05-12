# Plan

Tactical execution for the eight-slice outline. Each slice is one PR. The plan assumes a clean `main` checkout. Conventional commits per `CLAUDE.md`.

## Slice 1 — CI gate, ESLint flat config, bundle-size budget

### Steps

1. **Create branch** `chore/ci-bootstrap`.
2. **Create `eslint.config.js`** at repo root (flat config):
   ```js
   import js from '@eslint/js';
   import tseslint from 'typescript-eslint';
   import react from 'eslint-plugin-react';
   import reactHooks from 'eslint-plugin-react-hooks';
   export default [
     js.configs.recommended,
     ...tseslint.configs.recommended,
     {
       files: ['web/src/**/*.{ts,tsx}'],
       plugins: { react, 'react-hooks': reactHooks },
       languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
       rules: {
         ...react.configs.recommended.rules,
         ...reactHooks.configs.recommended.rules,
         'react/react-in-jsx-scope': 'off',
       },
       settings: { react: { version: '19' } },
     },
     { ignores: ['**/dist/**', 'claude_design/**', 'web/public/data/**', 'shared/dist/**'] },
   ];
   ```
3. **Add deps to root `package.json`** devDeps: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`. Run `npm install`.
4. **Update root `package.json`** `lint` script to `eslint .` (flat config doesn't need `--ext`).
5. **Create `scripts/check-bundle-size.ts`**:
   - Glob `web/dist/assets/*.js`, gzip each via `node:zlib`, print sorted manifest.
   - Fail if max chunk > 500 kB gz; print remaining headroom.
   - Add root `package.json` script `"check-bundle-size": "tsx scripts/check-bundle-size.ts"`.
6. **Create `.github/workflows/ci.yml`**:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     web:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: '24', cache: 'npm' }
         - run: npm ci
         - run: npm run typecheck
         - run: npm run lint
         - run: npm test
         - run: npm run build
         - run: npm run check-bundle-size
   ```
7. **Verify:** `npm run lint && npm run typecheck && npm test && npm run build && npm run check-bundle-size` all green locally.
8. **Commit** `chore: add CI workflow, ESLint flat config, bundle-size budget`. Push, open PR, confirm green.

### Checkpoint

PR shows five green steps. `npm run check-bundle-size` prints `largest: ~Y kB / budget 500 kB`.

---

## Slice 2 — Design-token bridge, fonts, app shell

### Steps

1. **Branch** `feat/design-tokens`.
2. **Add fonts** to `web/package.json`: `@fontsource/inter`, `@fontsource/source-serif-4`, `@fontsource/jetbrains-mono`. `npm install`.
3. **Copy** `claude_design/tokens.css` → `web/src/styles/tokens.css`. **Delete** the leading `@import url("https://fonts.googleapis.com/...")` line.
4. **Edit `web/src/main.tsx`** to import the three font packages with the weight set from research §12 (`@fontsource/inter/400.css` … `/700.css`; `source-serif-4/400.css`…`/700.css`; `jetbrains-mono/400.css`…`/600.css`).
5. **Edit `web/src/index.css`** — replace body reset with `@import './styles/tokens.css';` followed by the three Tailwind directives. Drop the hard-coded `font-family`/`background`/`color`.
6. **Rewrite `web/tailwind.config.ts`** `theme.extend`:
   - `colors`: every paper-, crab-, gold-, ink-, green-, amber-, red-, blue- ramp, plus semantic aliases (`primary`, `accent`, `bg-paper`, `bg-deep`, `bg-soft`, `surface-1/2`, `fg-1/2/3`, `border-soft`, `border-strong`, `success`, `warning`, `danger`, `info`, plus jurisdiction `dc/md/va` for back-compat) — each as `var(--token)`.
   - `fontFamily`: `display: ['var(--font-display)']`, `sans: ['var(--font-body)']`, `mono: ['var(--font-mono)']`.
   - `fontSize`: tuples `[size, lineHeight]` for `xs, sm, base, h4, h3, h2, h1, display-md, display-lg, display-xl`.
   - `spacing`: `1: 'var(--space-1)'` … `12: 'var(--space-12)'`.
   - `borderRadius`: `xs/sm/md/lg/xl/full`.
   - `boxShadow`: `1, 2, 3, focus`.
   - `maxWidth`: `container: '1280px'`, `reading: 'var(--reading-max)'`.
7. **Port primitives** to `web/src/components/`:
   - `Container.tsx`, `Card.tsx`, `JurisdictionBadge.tsx`, `SectionHeader.tsx`, `Source.tsx`, `BrandMark.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx` — Tailwind classes only.
   - `JurisdictionBadge` uses warm-palette pairs from `DESIGN_SYSTEM.md` (DC `bg-crab-50/text-crab-700`, MD `bg-gold-50/text-gold-700`, VA `bg-blue-50/text-blue-700`); reject the `juriBgFg` swatches from `data.js`.
   - `Layout.tsx` — replace existing 45-line file; consume new `SiteHeader` / `SiteFooter`.
   - **Expand** `MetricCard.tsx` to props `{ label, value, change?, changeLabel?, sub?, source?, health? }`.
8. **Patch `claude_design/DESIGN_SYSTEM.md`** — note `Container` is `1280px`, not 1200.
9. **Patch `web/src/index.html`** — add `lang="en"` to `<html>`.
10. **Verify:** `npm run dev`; `/`, `/county/24031`, `/compare` render in new typography/palette; gold focus ring on tab; no console errors. `npm run typecheck && npm run lint && npm test && npm run build && npm run check-bundle-size`.
11. **Commit** `feat: bridge tokens.css into Tailwind theme; port app shell to design system`.

### Checkpoint

Visual diff vs. main: warm paper background, Source Serif h1, Inter nav, JetBrains Mono captions. Bundle still under 500 kB gz.

---

## Slice 3 — Transform-side market health, affordability, property tax, population

### Steps

1. **Branch** `data/health-affordability-tax-population`.
2. **Edit `shared/src/types.ts`** — add `propertyTaxRate?: number` to `CountySummary` (top-level; `marketHealthScore` and `affordabilityIndex` already exist on `CountyCurrentSnapshot`). Run `npm run build --workspace=shared`.
3. **Create `scripts/lib/property-tax-rates.ts`** — exports `PROPERTY_TAX_RATES: Record<Fips, number>` keyed by all 21 FIPS, sourced from each county's published 2025/2026 tax rate (cite source in a top comment per row). Values in decimal (e.g., `0.0085` for 0.85%).
4. **Create `scripts/lib/populations.ts`** — exports `getPopulationByFips()` that reads from existing Census ACS cache (`scripts/.cache/census.json`) for `B01003_001E` (total population), most recent vintage. Returns `Record<Fips, number>`. If absent, returns empty `{}` and the consumer skips.
5. **Create `scripts/transform/marketHealth.ts`**:
   ```ts
   export function marketHealthScore(input: {
     monthsSupply?: number;
     saleToListRatio?: number;
     pctSoldAboveList?: number;
     inventoryYoY?: number;
   }): number | undefined {
     // Each sub-score 0–100; require at least 3 of 4 inputs or return undefined.
     // monthsSupply: 100 - (msup - 1) * 18, clamped 0..100  (weight 30)
     // saleToList:   60 + (1 - (1 - ratio) * 50) * 0.4, clamped 0..100 (weight 25)
     // pctSoldAboveList: pct * 200, clamped 0..100  (weight 20)
     // inventoryYoY: 70 - inventoryYoY * 100, clamped 0..100  (weight 25)
     // weighted-sum the available subs, renormalize the weight, round.
   }
   ```
6. **Create `scripts/transform/affordability.ts`**:
   ```ts
   export function affordabilityIndex(input: {
     medianSalePrice?: number;
     propertyTaxRate?: number;
     medianHouseholdIncome?: number;
     mortgageRate: number;       // decimal, e.g. 0.0623
   }): number | undefined {
     // Require all four; otherwise undefined.
     // PITI: P+I = principal*(r/12)*(1+r/12)^360 / ((1+r/12)^360 - 1) on 80% LTV
     //       Tax = price * propertyTaxRate / 12
     //       Ins = price * 0.0035 / 12
     // Return total / (income / 12), as a ratio.
   }
   ```
7. **Wire into `scripts/transform/build-county-pages.ts`**: read mortgage rate from `web/public/data/metrics/mortgage-rates.json` (latest point); compute the two new fields per county; write `propertyTaxRate` and `population` at top level. Log `warn` and skip on missing inputs.
8. **Tests** — `scripts/transform/marketHealth.test.ts` and `scripts/transform/affordability.test.ts`:
   - Healthy market (1.0 mo, 1.02 ratio, 0.6 above, -0.2 inv) → high score (>75).
   - Soft market (6.0 mo, 0.96 ratio, 0.05 above, +0.5 inv) → low score (<35).
   - Affordability: 600k/0.95%/120k/0.0623 → ~0.4–0.5; 200k/0.95%/120k/0.0623 → <0.3.
   - Missing inputs → `undefined`.
9. **Run** `npm run transform --workspace=scripts`. Inspect `jq '.current.marketHealthScore, .current.affordabilityIndex, .propertyTaxRate, .population' web/public/data/counties/24031.json`.
10. **Verify:** all 21 counties have `propertyTaxRate` and `population`; sparse counties (24510, 51600) emit warns and have `marketHealthScore` / `affordabilityIndex` absent. `npm run typecheck && npm run lint && npm test && npm run build`.
11. **Commit** `data: add marketHealthScore, affordabilityIndex, propertyTaxRate, population to county summaries`.

### Checkpoint

19 of 21 counties carry all four new fields; 2 sparse counties cleanly skip with warns. Tests green.

---

## Slice 4 — Home page (everything except the map)

### Steps

1. **Branch** `feat/home-redesign`.
2. **Add `getMortgageRates()`** to `web/src/api.ts` returning `MetricSeries`.
3. **Create `web/src/lib/metro.ts`** — `deriveMetroSnapshot(counties: CountySummary[], mortgageRates: MetricSeries): MetroSnapshot` (median of medians for sale price, latest weekly rate, etc.). Returns the `MetroSnapshot` interface from outline.
4. **Create `web/src/lib/colors.ts`** — replace the current 24-line file with a `dirColor(n)` and `healthColor(score)` matching prototype semantics (`#059669 / #dc2626 / #d97706 / #1d4ed8 / #059669`).
5. **Create `web/src/components/home/`**:
   - `Hero.tsx` — eyebrow + 56px display headline + lede + right-rail "What you'll find here" card. Lede text comes from a literal in the file (no data dependency).
   - `MetricStrip.tsx` — 5-up grid; takes `MetroSnapshot`; renders 4 `MetricCard`s + `HealthCard`.
   - `HealthCard.tsx` — 4-segment bar based on bucket from `healthColor`.
   - `BiggestMovers.tsx` — top-5/bottom-5 from `counties.sort((a,b) => b.current.zhviYoY - a.current.zhviYoY)`. Skip counties missing `zhviYoY`.
   - `MoversCard.tsx` — diverging-bar row component.
   - `WhatsDriving.tsx` — 2x2 grid of 4 `DriverCard`s. Two cards (Mortgage, Inventory) wire to real series; two (Federal, CountySplit) render `<InsufficientData />` until federal data lands. Defer the `<InsufficientData />` primitive to Slice 6 — for this slice, place a labeled `<Card>` with eyebrow + "Coming with federal-employment ingest" caption.
   - `DriverCard.tsx` — generic shell.
6. **Rewrite `web/src/pages/Home.tsx`** to compose the above + a stub `<ChoroplethMap />` placeholder (still 22-line stub from main). Use a single `useQueries` to fetch all 21 counties + mortgage rates in parallel.
7. **Tests** — `web/src/pages/Home.test.tsx`: mock 21 counties via React Query test wrapper, assert `BiggestMovers` shows 5 gainers + 5 losers, sparse counties absent from the cards that need their fields.
8. **Verify:** `npm run dev`; `/` shows hero, 5-up strip, biggest movers with real numbers, two real driver charts. Lighthouse a11y ≥95. Bundle still under 500 kB gz.
9. **Commit** `feat: home page hero, metric strip, biggest movers, drivers`.

### Checkpoint

`/` renders end-to-end with no missing-field errors. Sparse counties (24510, 51600) appear/skip correctly per Slice 3 data shape.

---

## Slice 5 — MapLibre choropleth + GeoJSON pipeline

### Steps

1. **Branch** `feat/choropleth-map`.
2. **Create `scripts/prep-geojson.ts`**:
   - Fetch Census TIGER county shapes for state codes `11`, `24`, `51` from `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_20m.zip` (or the existing already-downloaded artifact if cached).
   - Filter to the 21 DMV FIPS.
   - Simplify with `mapshaper` (npm dep) at `-simplify 5%` to bring file under ~80 kB.
   - Write `web/public/data/geo/dmv-counties.geojson` with `properties: { fips, name, jurisdiction }`.
   - Add `prep-geojson` script to root `package.json` (already declared); ensure it actually runs.
3. **Run** `npm run prep-geojson` once; commit the resulting GeoJSON.
4. **Create `web/src/lib/map-style.ts`** — exports `buildMapStyle(metric: ChoroplethMetric, counties: Record<Fips, CountySummary>)`. Uses MapLibre `interpolate` paint expressions on a `feature-state` set per-county at runtime.
5. **Create `web/src/lib/color-scales.ts`** — diverging YoY (8 stops), sequential value/dom/supply (6 stops, reverse for dom/supply), 4-bucket categorical for health. Mirrors prototype `colorFor`.
6. **Replace `web/src/components/ChoroplethMap.tsx`**:
   - `useEffect` initializes `maplibregl.Map` with free vector style (e.g., `https://demotiles.maplibre.org/style.json` for v1; swap for a free Carto style if needed).
   - Adds `dmv-counties` GeoJSON source + `dmv-fill` and `dmv-outline` layers.
   - Hover handler: `setFeatureState({ source, id }, { hover: true })` + populate side-rail from `counties[fips]`.
   - Click handler: `navigate('/county/' + fips)`.
   - Metric switcher pills above the map; legend bar bottom-left.
   - Right-rail hover detail (default = jurisdiction summary 1/9/11; on hover = `Row` rows from prototype map.jsx).
7. **Lazy-load** the component if bundle-size check would otherwise fail: `const ChoroplethMap = React.lazy(() => import('./ChoroplethMap'))`; wrap in `<Suspense fallback={<MapPlaceholder/>}>` in `Home.tsx`.
8. **Tests** — `ChoroplethMap.test.tsx`: smoke render with mock counties + mocked `maplibregl.Map`; assert click handler navigates with the correct FIPS.
9. **Verify:** `/` shows real choropleth, all 21 jurisdictions visible (small ones tiny per Decision 3). Click Loudoun → `/county/51107`. Metric switch updates fills via `setPaintProperty` in <100ms. Bundle under 500 kB gz (lazy-loaded chunk separate).
10. **Commit** `feat: maplibre choropleth on home with metric switcher`.

### Checkpoint

Functional map with all 21 counties; click-to-navigate; metric switching live. No `console.error` from MapLibre.

---

## Slice 6 — County page rewrite

### Steps

1. **Branch** `feat/county-redesign`.
2. **Create `web/src/components/InsufficientData.tsx`** — small primitive: eyebrow + "Insufficient data" headline + caption explaining which fields are needed.
3. **Create `web/src/components/county/`**:
   - `CountyHeader.tsx` — back button, jurisdiction badge, FIPS, population, 44px display name, `summary` lede (literal until Slice 8 wires methodology), "At a glance" KV card (income, property tax rate, fed exposure → `<InsufficientData />` if any missing).
   - `SnapshotGrid.tsx` — 6-up `MetricCard` grid (Typical home value, Median sale price, DOM, Supply, Market health, Affordability). Each card renders fallback `—` when its field is absent.
   - `BigChart.tsx` — long-run HPI Recharts `LineChart` with overlay chips (metro median = mean across counties; 6 nearest neighbors by `|zhvi - current.zhvi|`); range pills All/20y/10y; ReferenceArea 2007–2011; ReferenceLine y=100. <150 LOC; extract a `<NeighborChip />` if needed.
   - `Affordability.tsx` — 3 sliders (income, down %, mortgage rate) using `web/src/lib/affordability-calc.ts`. Shows total monthly cost, share of income, status pill (`<=30%` green, `<=40%` amber, else red).
   - `MarketHealthBreakdown.tsx` — `<Donut />` (inline SVG) + 4 weighted sub-rows from `current.marketHealthScore` decomposition. **Note:** Slice 3 stores only the score, not the per-component breakdown; this section either (a) recomputes sub-scores client-side from `current.{monthsSupply, saleToListRatio, pctSoldAboveList}` (preferred) or (b) renders `<InsufficientData />` if missing.
   - `ForecastCone.tsx` — `<InsufficientData />` until forecasts are ingested.
   - `FederalExposure.tsx` — `<InsufficientData />` until federal-employment QCEW is ingested.
4. **Create `web/src/lib/affordability-calc.ts`** — pure function used by both the slider UI and (re-derives) the static `affordabilityIndex` from Slice 3.
5. **Rewrite `web/src/pages/County.tsx`** to compose the sections; <150 LOC.
6. **Tests** — `web/src/pages/County.test.tsx`: full county (`24031`) renders all six sections; sparse county (`24510`) renders `CountyHeader` + `SnapshotGrid` (subset) + 4×`<InsufficientData />`.
7. **Verify:** `/county/24031`, `/county/11001`, `/county/24510` all render. Affordability sliders update live. BigChart range/overlay toggle. Bundle still under 500 kB.
8. **Commit** `feat: county page redesign with snapshot grid, big chart, affordability, health breakdown`.

### Checkpoint

All 21 county URLs render without crashing; sparse counties render placeholders honestly; full counties render every section.

---

## Slice 7 — Compare page with URL state

### Steps

1. **Branch** `feat/compare-redesign`.
2. **Create `web/src/lib/compare-metrics.ts`** — exports `COMPARE_METRICS: CompareMetric[]` (the 6 from research §18). Each entry's `get()` returns `c.current.zhvi` etc.; affordability returns `c.current.affordabilityIndex`.
3. **Create `web/src/hooks/useCompareState.ts`**:
   ```ts
   export function useCompareState(): CompareState {
     const [params, setParams] = useSearchParams();
     const selected = (params.get('counties') ?? '').split(',').filter(Boolean).slice(0, 5);
     const metric = (COMPARE_METRICS.find(m => m.id === params.get('metric'))?.id) ?? 'zhvi';
     const update = (next: Partial<{ counties: string[]; metric: CompareMetricId }>) => { … };
     // toggle, setMetric implemented via update().
   }
   ```
4. **Create `web/src/components/compare/`**:
   - `CountyPicker.tsx` — sticky left rail (320px, top-80, alignSelf:start, calc(100vh-100px) overflow). Search input + 3 jurisdiction groups + custom checkbox rows. Capped rows `disabled={atCap}` with `aria-disabled`. <150 LOC.
   - `MetricPicker.tsx` — pill row. `aria-pressed` on each pill.
   - `CompareChart.tsx` — Recharts `LineChart`, last-60-months ZHVI per selected county, custom legend row above chart.
   - `RankedTable.tsx` — sorted by selected metric; inline 8px progress bar.
   - `DifferenceCallout.tsx` — gold-treatment thresholds per Design §5 / research Q34.
   - `EmptyState.tsx` — dashed-border "Pick at least 2 counties" card.
5. **Rewrite `web/src/pages/Compare.tsx`** to consume `useCompareState` and compose the above. Fetch all 21 counties via `useQueries` (one fetch per FIPS, in parallel); chart data filters to selected.
6. **Tests** — `web/src/hooks/useCompareState.test.tsx`: with `MemoryRouter`, load `?counties=24031,24027&metric=zhvi`, assert state. `toggle('11001')` → URL becomes `?counties=24031,24027,11001&metric=zhvi`. Cap-at-5: 6th toggle is no-op.
7. **Verify:** `/compare?counties=24031,24027,11001,51107&metric=zhvi` hydrates UI. Toggling counties updates URL on every interaction. `DifferenceCallout` flips gold when spread thresholds trip (e.g., select `51610` + `24510`).
8. **Commit** `feat: compare page with sticky picker rail, metric switcher, ranked table, URL state`.

### Checkpoint

URL round-trip: paste link → identical view. All interactions write back to URL. Cap at 5.

---

## Slice 8 — `/counties` index and `/methodology` static page

### Steps

1. **Branch** `feat/counties-index-and-methodology`.
2. **Create `web/src/pages/Counties.tsx`** — fetch all 21 county summaries via `useQueries`; controlled search input filters by short name / FIPS / jurisdiction; render 3 sections (DC / MD / VA) of card links. <150 LOC.
3. **Create `web/src/pages/Methodology.tsx`** — static MDX-free page: an inline JSX rendering of methodology sections drawn from `claude_design/uploads/02-DATA_MODEL.md` and `04-DMV_CONTEXT.md`. Cite each data source from `SiteFooter.sources`. <150 LOC; split into `<MethodologySection />` if needed.
   - **Deviation:** Outline mentions MDX. To avoid adding `@mdx-js/rollup` as a build dep (and another bundle hit), copy the relevant prose into JSX literals. The two upstream markdown files are committed under `claude_design/uploads/` for human reference; the page renders a curated subset.
4. **Edit `web/src/App.tsx`** — add `<Route path="/counties" element={<Counties />} />` and `<Route path="/methodology" element={<Methodology />} />`.
5. **Edit `web/src/components/SiteHeader.tsx`** — wire `aria-current="page"` based on `useLocation().pathname`. Update the four nav items so all four resolve to a route. The "GitHub" anchor stays as a real external link.
6. **Tests** — `web/src/pages/Counties.test.tsx`: typing in the search filters the visible county count.
7. **Verify:** all four header nav items return 200. Keyboard search filters live. `/methodology` cites every data source mentioned in `SiteFooter`.
8. **Commit** `feat: add /counties index and /methodology page`.

### Checkpoint

Header nav has zero dead links. Lighthouse a11y ≥95 on all four routes. Final bundle still under 500 kB gz.

---

## Cross-slice notes

- **Branch hygiene.** Slices 1–8 land in order; each rebases on `main` after the prior merges. Skipping ahead is fine for slices that don't share code (e.g., Slice 3 can run in parallel with Slice 2 since they touch disjoint trees).
- **No-invented-values rule.** If any transform input is absent, the field is omitted, a `warn` is logged, and the rendering layer shows `<InsufficientData />` or `—`. This applies uniformly across Slices 3/4/6/7.
- **Bundle pressure.** Slice 5's MapLibre is the riskiest moment. The plan pre-commits to lazy-loading the choropleth chunk; if that's still tight, Slice 7's Recharts page becomes a second `React.lazy` candidate.
- **Component size cap.** Several prototype sections (BigChart, ForecastCone, MarketHealthBreakdown) hover near 150 LOC. The plan calls out an extraction (`NeighborChip`, `Donut`, `MethodologySection`) before any file ships at 149.

## Next
**Phase:** Implement
**Artifact to review:** `docs/crispy/ui-redesign/5-plan.md`
**Action:** Review structure and key decisions — this is a spot-check document. Then invoke `crispy-implement` with project name `ui-redesign`.
