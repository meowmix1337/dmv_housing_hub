# Research

## Existing frontend baseline

### 1. `web/src/` file structure and line counts

```
web/src/App.tsx                       23
web/src/main.tsx                      30
web/src/index.css                     25
web/src/api.ts                        38
web/src/components/PriceChart.tsx     78
web/src/components/MetricCard.tsx     28
web/src/components/ChoroplethMap.tsx  22
web/src/components/Layout.tsx         45
web/src/lib/colors.ts                 24
web/src/lib/format.ts                 28
web/src/pages/Home.tsx                59
web/src/pages/County.tsx              93
web/src/pages/Compare.tsx             23
                              total  516
```

Layout: `pages/`, `components/`, `lib/` (no `assets/`, no `hooks/`, no `styles/`).

### 2. Tailwind / CSS configuration

`web/tailwind.config.ts` (16 lines):

```ts
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dc: '#dc2626',
        md: '#ca8a04',
        va: '#1d4ed8',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`theme.extend` only adds three jurisdiction colors. No font, spacing, radius, shadow, or motion tokens. No plugins.

`web/src/index.css` (25 lines): the three Tailwind directives, plus a body/html reset that hard-codes `font-family` to a system stack, `background: #fafafa`, `color: #0a0a0a`. **No CSS custom properties are declared anywhere in `web/src/`.** No `:root`, no `--*` variables, no theme extension JS.

`web/postcss.config.js` is present (81 bytes — assumed to chain `tailwindcss` + `autoprefixer`).

### 3. Pinned dependencies (`web/package.json`)

```
"@dmv/shared": "*"
"@tanstack/react-query": "^5.51.0"
"maplibre-gl":           "^4.5.0"
"react":                 "^18.3.0"
"react-dom":             "^18.3.0"
"react-router-dom":      "^6.26.0"
"recharts":              "^2.12.0"

"@types/react":          "^18.3.0"
"@types/react-dom":      "^18.3.0"
"@vitejs/plugin-react":  "^4.3.0"
"autoprefixer":          "^10.4.0"
"postcss":               "^8.4.0"
"tailwindcss":           "^3.4.0"
"typescript":            "^5.5.0"
"vite":                  "^5.4.0"
"vitest":                "^2.0.0"
```

Root `package.json` lists `eslint ^9.0.0`, `@typescript-eslint/{parser,eslint-plugin} ^8.0.0`, `prettier ^3.3.0`, `engines.node >=24`, workspaces `["shared","scripts","web"]`.

### 4. Existing pages

**`Home.tsx` (59 lines).** Renders no data. Hard-codes a `COUNTIES` array of 21 `{ fips, name }` records and renders a `<h1>DMV housing market</h1>` + lede paragraph + a 1/2/3-column `<ul>` of `<Link to="/county/{fips}">` rows inside a bordered `<section>`. No `api.ts` calls. No map (a `TODO` comment notes `ChoroplethMap` will replace the list once GeoJSON + ingest are wired).

**`County.tsx` (93 lines).** One `useQuery({ queryKey: ['county', fips], queryFn: () => getCountySummary(fips) })`. On success renders:

- Title: `data.name` + `Last updated {formatDate(data.lastUpdated)}`.
- 4-up `<MetricCard>` row (sm:2-up, lg:4-up) for `current.zhvi (+ zhviYoY)`, `current.medianSalePrice (+ medianSalePriceYoY)`, `current.daysOnMarket`, `current.monthsSupply`.
- Conditional `<PriceChart data={series.fhfaHpi} unit="index" cadence="annual" />` inside a bordered card with FRED source caption.
- Conditional `<PriceChart data={series.zhvi} unit="USD" />` inside a bordered card with Zillow Research source caption.

Only two of the five available series (`fhfaHpi`, `zhvi`) are ever rendered.

**`Compare.tsx` (23 lines).** Pure stub — renders `<h1>Compare counties</h1>` and a "Coming in step 11" paragraph. No data fetch, no UI. The file's docblock describes intent (multi-select up to 5 counties, fetch in parallel via React Query, Recharts `LineChart` with one `Line` per county, persist selection in URL search params).

`api.ts` exposes three functions: `getCountySummary(fips)` → `/data/counties/{fips}.json`, `getMetricSeries(metric)` → `/data/metrics/{metric}.json`, `getManifest()` → `/data/manifest.json`. Today only `getCountySummary` is consumed (by `County.tsx`).

### 5. Existing shared components

**`Layout.tsx`.** Top-level `<div min-h-full flex flex-col>`. Header: `<Link to="/">DMV Housing</Link>` + nav with two `NavLink`s (`/` "Overview", `/compare` "Compare"). `<main class="flex-1">` wraps `<Outlet />` inside `max-w-6xl mx-auto px-4 py-6`. Footer: a single static line of `Data sources: FRED, U.S. Census Bureau, BLS, Zillow Research, Redfin Data Center. Updated automatically via GitHub Actions.` No props.

**`ChoroplethMap.tsx`.** Stub — renders only a dashed `<div>` saying "Choropleth map — coming in step 8". No props. No MapLibre instance, no GeoJSON loader, no event handlers.

**`MetricCard.tsx`.** Props: `{ label: string; value: string; delta?: string; deltaLabel?: string }`. Renders `<div rounded-lg border border-neutral-200 bg-white p-4>`: uppercase `label`, `text-2xl font-semibold tabular-nums` value, optional delta line whose color is `text-red-600` if delta starts with `-`, else `text-emerald-600`, else `text-neutral-400`.

**`PriceChart.tsx`.** Props: `{ data: MetricPoint[]; unit: 'USD' | 'index' | 'percent'; cadence?: Cadence; height?: number }` (default cadence `monthly`, height `320`). Renders Recharts `<ResponsiveContainer>` → `<LineChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>` with `<CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3">`, `<XAxis tick={{fontSize:12, fill:'#6b7280'}} tickFormatter={…} minTickGap={40}>`, `<YAxis width={64}>`, `<Tooltip contentStyle={{fontSize:12}}>`, single `<Line type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive={false} />`. X formatter slices the year for `annual`, otherwise `toLocaleDateString({month:'short', year:'2-digit'})`.

`web/src/lib/colors.ts` exports three palettes (referenced by no component file today): `COUNTY_COLORS` (5 hex blue/amber/green/purple/rose), `CHOROPLETH_SCALE` `{negative:'#ef4444', neutral:'#f3f4f6', positive:'#1d4ed8'}`, and `JURISDICTION_COLORS` `{DC:'#1d4ed8', MD:'#15803d', VA:'#b45309'}`.

`web/src/lib/format.ts` exports `formatCurrency`, `formatNumber`, `formatPercent` (signed, fractionDigits default 1), `formatDate` (`year:'numeric', month:'short', day:'numeric'`).

### 6. Tests under `web/`

None. `find web -name "*.test.*" -o -name "*.spec.*"` returns nothing. `web/package.json` defines `"test": "vitest run --passWithNoTests"`. Tests exist only under `scripts/`: `census.test.ts`, `zillow.test.ts`, `bls.test.ts`, `redfin.test.ts`, `http.test.ts`, `counties.test.ts`, `storage.test.ts`.

---

## Data shape and availability

### 7. `CountySummary` and `MetricSeries` types

Source: `shared/src/types.ts` (also surfaced as `@dmv/shared`).

```ts
type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
type Jurisdiction = 'DC' | 'MD' | 'VA';

type MetricId =
  | 'fhfa_hpi' | 'median_sale_price' | 'median_list_price'
  | 'median_price_per_sqft' | 'zhvi_all_homes' | 'zhvi_sfh' | 'zhvi_condo'
  | 'zori_rent' | 'active_listings' | 'new_listings' | 'homes_sold'
  | 'months_supply' | 'days_on_market' | 'sale_to_list_ratio'
  | 'pct_sold_above_list' | 'pct_price_drops' | 'mortgage_30y_rate'
  | 'mortgage_15y_rate' | 'median_household_income' | 'median_home_value'
  | 'median_gross_rent' | 'unemployment_rate' | 'federal_employment'
  | 'building_permits' | 'hotness_score' | 'hotness_rank';

type Unit =
  | 'USD' | 'USD_per_sqft' | 'percent' | 'ratio' | 'days' | 'months'
  | 'count' | 'index_2000=100' | 'index_other';

interface MetricPoint { date: string; value: number; }

interface MetricSeries {
  metric: MetricId; fips: string; unit: Unit; cadence: Cadence;
  source: string; lastUpdated: string; points: MetricPoint[];
}

interface CountyCurrentSnapshot {
  medianSalePrice?: number;     medianSalePriceYoY?: number;
  zhvi?: number;                zhviYoY?: number;
  daysOnMarket?: number;        monthsSupply?: number;
  saleToListRatio?: number;     pctSoldAboveList?: number;
  unemploymentRate?: number;    marketHealthScore?: number;
  affordabilityIndex?: number;
}

interface CountySeries {
  fhfaHpi?: MetricPoint[]; zhvi?: MetricPoint[];
  medianSalePrice?: MetricPoint[]; daysOnMarket?: MetricPoint[];
  activeListings?: MetricPoint[];
}

interface CountyForecast {
  source: string; metric: MetricId; horizonMonths: number;
  forecastValue: number; forecastChangePct: number; publishedAt: string;
}

interface CountySummary {
  fips: string; name: string; jurisdiction: Jurisdiction;
  population?: number; medianHouseholdIncome?: number;
  lastUpdated: string;
  current: CountyCurrentSnapshot;
  series: CountySeries;
  forecasts?: CountyForecast[];
}
```

The transform output (per actual JSON files inspected, see Q8) populates `current.{zhvi, zhviYoY, medianSalePrice, medianSalePriceYoY, daysOnMarket, monthsSupply, unemploymentRate, saleToListRatio, pctSoldAboveList}` and `series.{fhfaHpi, zhvi, medianSalePrice, daysOnMarket, activeListings}`. `current.marketHealthScore`, `current.affordabilityIndex`, top-level `population`, and `forecasts[]` are typed but **not populated** in any committed county JSON.

### 8. Counties present in `web/public/data/counties/`

21 files, one per county FIPS:

```
11001 (DC)
24003 24005 24009 24017 24021 24027 24031 24033 24510   (MD: 9)
51013 51059 51107 51153 51177 51179 51510 51600 51610 51683 51685   (VA: 11)
```

All 21 files share the same top-level keys: `current, fips, jurisdiction, lastUpdated, medianHouseholdIncome, name, series` (no `population`, no `forecasts`).

Field gaps:

- **19 of 21** files have a full `current` block (`daysOnMarket, medianSalePrice, medianSalePriceYoY, monthsSupply, pctSoldAboveList, saleToListRatio, unemploymentRate, zhvi, zhviYoY`).
- **2 files (`24510.json` Baltimore City, `51600.json` Fairfax City)** have a sparse `current` block: only `unemploymentRate, zhvi, zhviYoY`. They are also missing `series.activeListings`, `series.daysOnMarket`, `series.medianSalePrice` — only `fhfaHpi` and `zhvi` are present.
- All 21 files include `series.fhfaHpi` and `series.zhvi`. `fhfaHpi` series carries 879 monthly points (`grep -c '"date"'` on `11001.json` returned 879 across all five series combined; `fhfaHpi` itself runs annually `1975-01-01 …`).

`web/public/data/metrics/` contains exactly one file: `mortgage-rates.json` (national 30y fixed rate, weekly, FRED, going back to `1971-04-02`). No per-metro or per-county metric files.

`web/public/data/geo/` exists but is empty (no GeoJSON yet).

### 9. `manifest.json`

```json
{
  "generatedAt": "2026-05-08T13:38:59.212Z",
  "sources": [
    { "name": "fred",   "lastUpdated": "2026-05-07T15:34:59.136Z", "cadence": "monthly",  "status": "ok" },
    { "name": "census", "lastUpdated": "2026-05-07T20:28:32.354Z", "cadence": "annual",   "status": "ok" },
    { "name": "bls",    "lastUpdated": "2026-05-07T15:17:00.857Z", "cadence": "monthly",  "status": "ok" },
    { "name": "zillow", "lastUpdated": "2026-05-08T13:06:25.115Z", "cadence": "monthly",  "status": "ok" },
    { "name": "redfin", "lastUpdated": "2026-05-07T23:04:21.637Z", "cadence": "weekly",   "status": "ok" }
  ]
}
```

Per `Manifest`/`ManifestSourceEntry` types: `generatedAt` plus a `sources[]` of `{ name, lastUpdated, cadence, status:'ok'|'stale'|'error' }`. Today there is no top-level "DMV metro median" snapshot, no `metroLastUpdated` string, no global `mortgageRate`/`activeListings`/etc.

### 10. Prototype `data.js` / `county-data.js` fields vs. real `CountySummary`

The prototype's per-county records (`window.COUNTIES`) carry a flat shape:

```
fips, name, shortName, jurisdiction,
zhvi, zhviYoY, medianSalePrice, daysOnMarket, monthsSupply,
marketHealth, affordability, income, fedExposure
```

The real `CountySummary` nests current snapshot under `current` and uses different names. Mapping:

| Prototype field           | Real `CountySummary`                    | Status                                  |
|---------------------------|------------------------------------------|------------------------------------------|
| `fips`                    | `fips`                                  | present                                  |
| `name`                    | `name`                                  | present                                  |
| `shortName`               | —                                       | **NOT present** (must derive)            |
| `jurisdiction`            | `jurisdiction`                          | present                                  |
| `zhvi`                    | `current.zhvi`                          | renamed nesting                          |
| `zhviYoY`                 | `current.zhviYoY`                       | renamed nesting                          |
| `medianSalePrice`         | `current.medianSalePrice`               | renamed nesting                          |
| `daysOnMarket`            | `current.daysOnMarket`                  | renamed nesting                          |
| `monthsSupply`            | `current.monthsSupply`                  | renamed nesting                          |
| `marketHealth`            | `current.marketHealthScore`             | typed, **not populated** in JSONs        |
| `affordability`           | `current.affordabilityIndex`            | typed, **not populated** in JSONs        |
| `income`                  | top-level `medianHouseholdIncome`       | present (different name + nesting depth) |
| `fedExposure`             | —                                       | **NOT present** in type or JSON          |

`window.METRO` (prototype) carries metro-wide values (`medianSalePrice`, `medianSalePriceYoY`, `mortgageRate`, `mortgageRateYoY`, `activeListings`, `activeListingsYoY`, `marketHealth`, `daysOnMarket`, `lastUpdated`). **No equivalent metro snapshot exists in any JSON file in the repo.** The `manifest.json` exposes per-source freshness only, not a metro `lastUpdated`.

`COUNTY_DETAIL[fips]` (prototype) adds these fields not in any committed JSON:

- `population` (typed in `CountySummary` but unpopulated)
- `propertyTaxRate` (no type, no data)
- `series.fhfaHpi` ✓ (present in JSON)
- `series.zhvi` ✓ (present in JSON)
- `federal.pctOfJobs`, `federal.series` (not typed, not in data)
- `forecasts[]` (typed as `CountyForecast[]` but unpopulated; prototype hard-codes Bright MLS / Zillow / NAR mock entries)
- `healthBreakdown.{monthsSupply,saleToList,pctSoldAboveList,inventoryYoY}` each `{value, weight, score}` (no type, no data)
- `summary` (string blurb; not typed, not in data)

`window.FED_EMPLOYMENT`, `window.MORTGAGE_RATES`, `window.LISTINGS` are mock generators in `data.js`. The repo has `metrics/mortgage-rates.json` (real, weekly, national) but no metro federal employment series and no metro active-listings series committed.

---

## New design system

### 11. CSS custom properties in `tokens.css`

Loaded from `claude_design/tokens.css` (`:root` block). Grouped:

**Color — base palettes** (50/100/.../900 ramps, hex):
- `--crab-50 … --crab-900` (primary, Maryland-flag red, `--crab-500: #A4243B`)
- `--gold-50 … --gold-700` (Old Bay Gold, `--gold-400: #C9A227`)
- `--paper-50 … --paper-900` (warm neutrals, `--paper-100: #FBF8F3` page bg)
- `--ink-900: #2B201A` (deep brown-black)
- Semantic palettes: `--green-50/500/700`, `--amber-50/500/700`, `--red-50/500/700`, `--blue-50/500/700`.

**Color — semantic aliases:** `--primary, --primary-hover, --primary-press, --primary-soft, --on-primary`; `--accent, --accent-soft`; `--bg-paper, --bg-deep, --bg-soft`; `--surface-1 (#FFFFFF), --surface-2, --surface-inverse`; `--fg-1, --fg-2, --fg-3, --fg-disabled, --fg-on-deep, --fg-on-deep-2`; `--border-soft, --border-strong, --border-inverse`; `--ring`. Status: `--success, --success-bg, --success-fg`, same for `warning, danger, info`. Category accents: `--cat-rental, --cat-ownership, --cat-legal, --cat-senior, --cat-emergency`.

**Typography — families:**
- `--font-display: "Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif`
- `--font-body: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- `--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace`

**Typography — scale:** `--fs-display-xl 4.5rem (72)`, `--fs-display-lg 3.5rem (56)`, `--fs-display-md 2.625rem (42)`, `--fs-h1 2rem (32)`, `--fs-h2 1.625rem (26)`, `--fs-h3 1.25rem (20)`, `--fs-h4 1.0625rem (17)`, `--fs-body 1rem (16)`, `--fs-small 0.875rem (14)`, `--fs-xs 0.75rem (12)`. Line heights: `--lh-tight 1.15, --lh-display 1.2, --lh-snug 1.35, --lh-body 1.55`. Weights: `--fw-regular 400, --fw-medium 500, --fw-semibold 600, --fw-bold 700`.

**Spacing (4px base):** `--space-1: 4`, `--space-2: 8`, `--space-3: 12`, `--space-4: 16`, `--space-5: 20`, `--space-6: 24`, `--space-7: 32`, `--space-8: 40`, `--space-9: 48`, `--space-10: 64`, `--space-11: 80`, `--space-12: 96`.

**Radii:** `--radius-xs: 4`, `--radius-sm: 8`, `--radius-md: 12` (buttons), `--radius-lg: 16` (cards), `--radius-xl: 24` (hero/modal), `--radius-pill: 999`.

**Shadows:**
- `--shadow-1: 0 1px 2px rgba(43,32,26,.06), 0 1px 1px rgba(43,32,26,.04)`
- `--shadow-2: 0 4px 12px rgba(43,32,26,.08), 0 2px 4px rgba(43,32,26,.04)`
- `--shadow-3: 0 16px 40px rgba(43,32,26,.12), 0 4px 12px rgba(43,32,26,.06)`
- `--shadow-focus: 0 0 0 3px rgba(201,162,39,.4)`

**Layout:** `--container-max: 1200px`, `--reading-max: 680px`, `--header-h: 64px`.

**Motion:** `--t-fast: 150ms ease-out`, `--t-base: 200ms ease-in-out`, `--t-slow: 300ms ease`.

The file also globalises element styles: `html/body` font-body 16/1.55 with `optimizeLegibility`; `h1–h4` use `--font-display` (h3, h4 fall back to `--font-body`); `p { max-width: var(--reading-max); text-wrap: pretty }`; `a { color: var(--primary) }` with `:visited #6E2A55`; `:focus-visible { box-shadow: var(--shadow-focus); border-radius: var(--radius-xs) }`; utilities `.display-xl, .display-lg, .display-md, .eyebrow, .caption`; a `@media (prefers-reduced-motion: reduce)` block that clamps `animation-duration`/`transition-duration` to 0.01ms globally.

### 12. Google Fonts loading

Single `@import` at the top of `tokens.css`:

```css
@import url("https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap");
```

So three families and weights:

- Source Serif 4 — opsz 8–60, weights 400 / 500 / 600 / 700
- Inter — 400 / 500 / 600 / 700
- JetBrains Mono — 400 / 500 / 600

`display=swap`. Loaded via CSS `@import`, **not** via `<link>` and **not** via JS. The HTML files (`Home.html`, `County.html`, `Compare.html`) only `<link rel="stylesheet" href="tokens.css">`.

### 13. Inline hex colors used directly in prototype JSX (not via a CSS variable)

Found by reading each file:

- `components.jsx`: hard-coded `#dc2626`, `#ca8a04`, `#1d4ed8`, `#2B201A` inside `BrandMark`'s SVG.
- `home.jsx`: `#dc2626` (FederalCard), `#dc2626 / #d97706 / #1d4ed8 / #059669` (HealthCard segmented bar), `#A4243B` (InventoryCard area), `#1d4ed8` (MortgageCard line), `#9A9384` (axis ticks, dashed reference), `#E7E2D8` and `#F4EFE5` (axis lines / grid), `#fce7e7` (recession shaded area), `#059669` / `#dc2626` (county-split bars), `#FCF1DC` / `#EAD174` (gold callout), `#fff` (text on filled bars).
- `county.jsx`: same axis greys (`#6B6557`, `#9A9384`, `#C9C2B4`, `#F4EFE5`, `#E7E2D8`); line/area strokes `#dc2626`, `#1d4ed8`, `#A4243B`, `#2B201A`, `#059669`, `#d97706`; per-county `BigChart` `overlayColors` map keys `"11001":"#dc2626", "24031":"#A4243B", "24027":"#1f8b54", "51059":"#1d4ed8", "51107":"#0f766e", "51013":"#7c3aed", "24033":"#ea580c", "24003":"#0891b2", "24021":"#65a30d", "51153":"#be185d", metro:"#9A9384"`.
- `compare.jsx`: `SERIES_COLORS = ["#2B201A", "#A4243B", "#1d4ed8", "#059669", "#d97706"]`; gold callout palette `#FCF1DC / #EAD174 / #C9A227`; greys `#6B6557 / #C9C2B4 / #E7E2D8 / #F4EFE5`.
- `map.jsx`: `colorFor()` ramps:
  - `yoy` (diverging): `#7f1d1d / #b91c1c / #ef4444 / #e5e7eb / #a7d3b0 / #34a36b / #1f8b54 / #065f46`
  - `zhvi` (sequential, crab-tinted): `#FBF8F3 / #F4D2D7 / #E8A4AE / #BE4A5C / #8B1A2F / #4F0E1A`
  - `dom` and `supply` (sequential-reverse): `#065f46 / #1f8b54 / #a7d3b0 / #fde68a / #f59e0b / #b45309`
  - hex stroke `rgba(43,32,26,0.18)` and hover `#2B201A`; missing-value fill `#E7E2D8`.
- `data.js` palette helpers: `juriColor` returns `{DC:"#dc2626", MD:"#ca8a04", VA:"#1d4ed8"}`; `juriBgFg` returns `{DC:{bg:"#fee2e2",fg:"#991b1b"}, MD:{bg:"#fef3c7",fg:"#854d0e"}, VA:{bg:"#dbeafe",fg:"#1e40af"}}`. **These do not match `DESIGN_SYSTEM.md`'s table** for jurisdiction badges (`DC: #FBEEF0/#6E1424`, `MD: #FBF5E0/#5E4A0F`, `VA: #E4EEF7/#1B4067`). The prototype actually ships with the Tailwind-style red-200/yellow-200/blue-200 swatches, not the warm crab/gold/blue tokens described in the design doc. `healthColor` returns `#dc2626 / #d97706 / #1d4ed8 / #059669` for the four health bands.

### 14. All components defined in the prototype JSX

`components.jsx` (all attached via `Object.assign(window, …)` at bottom): `BrandMark`, `SiteHeader`, `SiteFooter`, `JurisdictionBadge`, `Card`, `MetricCard`, `SectionHeader`, `Container`, `Source`.

`home.jsx`: exported `window.HomePage`. Locally scoped (not on `window`): `Hero`, `MetricStrip`, `HealthCard`, `BiggestMovers`, `MoversCard`, `WhatsDriving`, `DriverCard`, `FederalCard`, `MortgageCard`, `InventoryCard`, `CountySplitCard`.

`county.jsx`: exported via `Object.assign(window, { CountyPage, Affordability, MarketHealthBreakdown, ForecastCone, FederalExposure })` and `window.BigChart = BigChart`. Locally scoped: `CountyHeader`, `KV`, `CountySnapshot`, `SnapshotCard`, `Chip`, `Slider`, `Donut`, `Stat`.

`compare.jsx`: exported `window.ComparePage`. Locally scoped: `CountyPicker`, `MetricPicker`, `EmptyState`, `CompareChart`, `RankedTable`, `DifferenceCallout`. Module constants `COMPARE_METRICS` (6 entries) and `SERIES_COLORS` (5 hex).

`map.jsx`: exported `window.DMVMap`. Locally scoped: `Row`, `LegRow`, helpers `valueOf`, `fmtMetricValue`, `colorFor`, `hexPath`, `luminance`. Module constants `HEX_LAYOUT` (21 cells) and `METRIC_OPTS` (5 entries).

### 15. Prototype primitive props

Documented from JSX signatures:

- `Container({ children, style })` — wraps in `maxWidth: 1280, margin:"0 auto", padding:"0 32px"`. Note: max 1280, not the doc's stated 1200.
- `BrandMark({ size = 28 })` — square SVG with three vertical bars (DC red / MD gold / VA blue).
- `SiteHeader({ current, onNav })` — sticky header, blurred translucent `--bg-paper`, four nav links (`home, counties, compare, data`), brand mark + label, "Updated {METRO.lastUpdated}" mono caption, GitHub button. Calls `onNav(id)` on click.
- `SiteFooter()` — no props; reads `window.METRO.lastUpdated`. Renders deep ink ground footer with brand block, "Pages" list, two-column "Data sources" list, bottom-row mono captions.
- `JurisdictionBadge({ j })` — pill (radius 4, not 999) using `juriBgFg(j)` colors, mono 11px 600, uppercase, min-width 28.
- `Card({ children, padding = 24, style })` — white surface, radius 16, 1px `--border-soft`.
- `MetricCard({ label, value, sub, source, change, changeLabel = "YoY" })` — eyebrow / display 32px serif value / mono YoY chip + caption / mono source line. min-height 130.
- `SectionHeader({ eyebrow, title, lede, actions })` — eyebrow + display 28px h2 + lede (max 640) + right-aligned actions.
- `Source({ children })` — mono 12px `--fg-3` line with 12px top margin.

### Q14/Q15 cross-check

`DESIGN_SYSTEM.md` lists the same component set under "Component patterns" plus extras that exist only as inline JSX (Picker, Diverging bar, Spread callout, Source line). `JurisdictionBadge` is documented as 999 radius / 2×8 padding / 11px Inter 600; the actual JSX uses `borderRadius: 4` and `fontFamily: var(--font-mono)`. **Discrepancy.**

---

## Page compositions

### 16. Home page section order

From `home.jsx::HomePage`:

1. `<Hero />` — bordered band, 64/48 padding-top/bottom; left column = eyebrow ("The DMV housing market · {lastUpdated}") + 56px display serif headline ("One metro, twenty-one markets…") + lede; right column = white card "What you'll find here" with 5 bullet items.
2. `<MetricStrip />` — `Container > display:grid grid-template-columns: repeat(5, 1fr) gap 16`; five cards: Metro median sale price (with YoY), 30-yr fixed mortgage rate (with YoY), Active listings (with YoY), Median days on market (no change), `<HealthCard />` (composite score 0–100 with 4-segment bar).
3. `<DMVMap />` — see Q20.
4. `<BiggestMovers />` — `SectionHeader` + 1fr/1fr grid of two `MoversCard`s ("Largest gains" top-5 by `zhviYoY`; "Largest declines" bottom-5 reversed). Each row: rank / jurisdiction badge + short name / horizontal bar (length proportional to `|zhviYoY|`/maxAbs) / mono YoY %. Bar color via `dirColor(c.zhviYoY)`. Trailing `<Source>`.
5. `<WhatsDriving />` — `SectionHeader` + 2-column grid of four `DriverCard`s: `FederalCard` (Area/AreaChart, BLS CES, area gradient `#dc2626`), `MortgageCard` (LineChart with `ReferenceLine y={6.81}`, line `#1d4ed8`), `InventoryCard` (Area, Redfin, gradient `#A4243B`), `CountySplitCard` (custom horizontal bars Howard 1.1mo vs DC 6.0mo). Each driver card pattern: eyebrow / 22px display title / 26px display callout (color via `dirColor`) / 140px chart / source-line + optional `link`.

### 17. County page section order

From `county.jsx::CountyPage`:

1. `<CountyHeader />` — bordered band; "← Back to overview" button; left column: jurisdiction badge + mono FIPS + mono population, 44px display name (`--fg-1`), 16px lede `c.summary`; right column: white "At a glance" card with three KV rows (Median household income, Property tax rate, Federal-job exposure). Below: mono "Data current as of {METRO.lastUpdated}".
2. `<CountySnapshot />` — 6-up `repeat(6, 1fr)` grid of `SnapshotCard` (radius 14, 16/18 padding, min-height 116, 24px display value): Typical home value, Median sale price, Days on market, Months of supply, Market health (value colored by `healthColor(c.marketHealth)`), Affordability (`pctOfIncome` with "vs. 30% rule" subline).
3. `<BigChart />` — full-width card (radius 20). Header band: eyebrow "The long view" + h2 "Home prices since 1975" + lede; right toolbar: 3-state range pill `All / 20 yr / 10 yr` (active = white surface + `--shadow-1`). Overlay row: chips for "DMV metro median" + 6 nearest-by-`|zhvi-current|` neighbors. Chart: 380px Recharts `LineChart` with `CartesianGrid` horizontal, `ReferenceArea x1=2007 x2=2011 fill="#fce7e7"` (housing crisis shading), `ReferenceLine y={100}` ("100 (year 2000)"), main line `#2B201A` 2.5px, dashed metro line in `#9A9384`, opacity-0.8 neighbor lines. Footer: mono source + mono "Shaded: 2007–2011 housing crisis".
4. Two-column row (`1.2fr 1fr`): `<Affordability />` + `<MarketHealthBreakdown />`.
   - `Affordability`: eyebrow / 24px h2 / lede; three sliders (income 40k–400k, down 0–50%, rate 3–9%); paper-100 results panel with two columns (Total monthly cost mono detail; Share of monthly income with status color); thin progress bar with 30% rule marker; mono assumptions footer.
   - `MarketHealthBreakdown`: eyebrow / 24px h2 / `<Donut score color>` 132×132 + status label and lede; below, four breakdown rows (Months of supply / Sale-to-list / % sold above list / Inventory YoY) each with `{value, weight, score}` and a `paper-100` track + colored fill bar.
5. `<ForecastCone />` — full-width card. Header has a 3-up forecast row (Bright MLS / Zillow / NAR), each `{source eyebrow, 22px display value, mono signed pct}`. 280px AreaChart of last 36 months ZHVI + 12 months future cone (high area `#A4243B` gradient over a `--bg-paper` low mask, dashed midline `#A4243B`, history line `#2B201A` 2.5px, `ReferenceLine x={lastDate}`).
6. `<FederalExposure />` — top: large 26px h2 with `(c.fedExposure*100).toFixed(0)% of jobs`; right: "Rank in metro" `#N / 21`. Body grid 1.5fr/1fr: 200px AreaChart (BLS QCEW share trend, `#dc2626` over a gradient) + 4 `Stat` rows (Federal share current / 3-yr-ago / Change / "Why this matters" callout in `--paper-100`).

### 18. Compare page section order

From `compare.jsx::ComparePage`:

1. Bordered hero band: eyebrow "Compare counties" + 44px display h1 "How does your county stack up against its neighbors?" + lede.
2. Two-column grid (`320px 1fr`) inside `Container`:
   - **Left rail** `<CountyPicker>` — sticky (`position:sticky, top:80, alignSelf:start, maxHeight: calc(100vh - 100px), overflow:auto`). Header eyebrow "Counties" + "{n} / 5" mono counter; lede "Pick 2 to 5 to compare."; search input (white-ish bg, 8px radius); three groups (DC / MD / VA) each with a jurisdiction badge + group label and a list of buttons. Each row is a 16×16 custom checkbox (1.5px border, fills `--fg-1` with white ✓ when on) + short name. Capped rows (>=5 selected) show `cursor:not-allowed`, `opacity:0.4`.
   - **Right column** stack:
     - `<MetricPicker>` — pill row of 6 buttons (`COMPARE_METRICS`): zhvi, sale, dom, supply, health, afford. Active = filled `--fg-1` / white text; inactive = surface white / 1px border-soft / `--fg-2` text.
     - If selection < 2: `<EmptyState>` (dashed border 1px `--border-strong`, 60×32 padding).
     - Else: `<CompareChart>` (380px Recharts `LineChart` of last 60 months ZHVI, one Line per county at `SERIES_COLORS[i]`, with a custom legend row above the chart showing color swatch + `JurisdictionBadge` + short name) → `<RankedTable>` (5-column table: Rank / County (color dot + badge + short name) / Value / inline 8px progress bar / mono YoY signed %) → `<DifferenceCallout>` (gold "wide spread" treatment when `spreadPct > 0.5` or metric-specific thresholds — see Q34).

### 19. Recharts components and config across the prototype

Imported from `Recharts` global: `LineChart`, `Line`, `AreaChart`, `Area`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `ReferenceLine`, `ReferenceArea`, `CartesianGrid`, `Legend`. (`BarChart` and `Bar` are imported but the rendered bar charts are hand-rolled `<div>`s, not Recharts bars — they appear in `BiggestMovers`, `MoversCard`, `CountySplitCard`, `RankedTable` as CSS divs with width%.)

Common axis/grid/tooltip styling (literally repeated across `home.jsx`, `county.jsx`, `compare.jsx`):

```js
<CartesianGrid stroke="#F4EFE5" vertical={false} />
<XAxis dataKey="…"
       tick={{ fontSize: 10|11, fill: "#6B6557" or "#9A9384", fontFamily: "var(--font-mono)" }}
       axisLine={{ stroke: "#C9C2B4" or "#E7E2D8" }} tickLine={false} />
<YAxis tick={{ fontSize: 10|11, fill: "#6B6557" or "#9A9384", fontFamily: "var(--font-mono)" }}
       axisLine={false} tickLine={false} width={36|40|42|56|64} />
<Tooltip contentStyle={{ fontSize: 12, fontFamily: "var(--font-mono)",
                         borderRadius: 8, border: "1px solid #E7E2D8" }} />
```

Variants used:

- `<Line type="monotone" stroke=… strokeWidth={1.5|2|2.5} dot={false} />`, sometimes with `strokeDasharray="3 3"` (metro overlay, forecast midline, reference lines).
- `<Area type="monotone" stroke=… fill="url(#…-grad)" />` with an inline `<defs><linearGradient id> <stop offset="0%" stopOpacity=0.18–0.20 /> <stop offset="100%" stopOpacity=0 /></linearGradient></defs>`. Used for federal employment (red), inventory (crab), forecast cone (crab over a `--bg-paper` mask).
- `<ReferenceLine y={100} strokeDasharray="3 3" label={…}>` — county-page BigChart 2000-baseline marker.
- `<ReferenceLine x={lastDate} strokeDasharray="3 3">` — forecast cone history/forecast separator.
- `<ReferenceArea x1={2007} x2={2011} fill="#fce7e7" fillOpacity={0.4} />` — housing-crisis shading.

`Legend` is imported (in `county.jsx`) but never rendered — the prototype always builds a custom legend row outside the chart.

`isAnimationActive` is **not** explicitly set anywhere in the prototype (defaults remain), unlike the existing `PriceChart.tsx` which sets `isAnimationActive={false}`.

### 20. Hex map computation (`map.jsx`)

The "map" is a hand-coded SVG hex grid. **No GeoJSON, no projection, no MapLibre.**

Layout: 21 entries in `HEX_LAYOUT`, each `{ fips, col, row }` with 0–6 column / 0–5 row coordinates, hand-placed by rough cardinal adjacency (Frederick top-left, Spotsylvania bottom-right). Odd rows are visually shifted right by half a column-width.

Geometry:

```js
const HEX_R = 46;
const COL_W = HEX_R * Math.sqrt(3);   // ≈ 79.67  horizontal spacing
const ROW_H = HEX_R * 1.5;            // = 69     vertical spacing
const PAD = 56;
cx = PAD + col * COL_W + (row % 2 === 1 ? COL_W/2 : 0);
cy = PAD + row * ROW_H;
```

Each cell is a pointy-top hexagon drawn by `hexPath(cx, cy, r)`:

```js
for i in 0..5: a = (Math.PI/3)*i - Math.PI/2; pt = (cx + r cos a, cy + r sin a);
path = M pts.join(L) Z
```

Inside each cell: a `circle` jurisdiction tick (`juriColor`), a 10px short-name label (truncated past 12 chars), and an 11px mono metric value below — text color flips between `#2B201A` and `#fff` based on `luminance(fill) > 0.55` (where `luminance = 0.299r + 0.587g + 0.114b`).

Color stops: `colorFor(c, metric)` switches on the metric and returns from a hand-crafted ramp (see Q13). YoY uses 8 thresholded stops anchored at zero; ZHVI/DOM/supply linearly map their domain into 6 stops.

Side panel toggles between a default jurisdictions summary (DC 1, MD 9, VA 11) and a hover detail card with five `Row`s (Typical home value with YoY, Median sale price, DOM, Supply, Market health) plus an "Open county detail →" CTA.

A bottom legend bar shows 6 color swatches and 6 stop labels driven by `metric`.

**Counties → hex layout map:**

| FIPS | Hex (col,row) | County |
|---|---|---|
| 24021 | (2,0) | Frederick MD |
| 24027 | (4,0) | Howard MD |
| 24005 | (5,0) | Baltimore Co. MD |
| 24510 | (6,0) | Baltimore City MD |
| 24031 | (3,1) | Montgomery MD |
| 24003 | (5,1) | Anne Arundel MD |
| 51107 | (0,2) | Loudoun VA |
| 51059 | (2,2) | Fairfax County VA |
| 11001 | (3,2) | DC |
| 24033 | (4,2) | Prince George's MD |
| 51153 | (1,3) | Prince William VA |
| 51600 | (2,3) | Fairfax City VA |
| 51610 | (3,3) | Falls Church VA |
| 51013 | (4,3) | Arlington VA |
| 51510 | (5,3) | Alexandria VA |
| 24009 | (6,3) | Calvert MD |
| 51683 | (0,4) | Manassas VA |
| 51685 | (1,4) | Manassas Park VA |
| 24017 | (5,4) | Charles MD |
| 51179 | (1,5) | Stafford VA |
| 51177 | (2,5) | Spotsylvania VA |

---

## Library and stack reconciliation

### 21. Tailwind `theme.extend` today vs. exposing `tokens.css` variables

Current `theme.extend` (full):

```ts
{ colors: { dc: '#dc2626', md: '#ca8a04', va: '#1d4ed8' } }
```

To expose `tokens.css` CSS variables as Tailwind utilities, the conventional pattern is to declare each token under the matching theme key as `var(--token)`:

- `colors`: paper-50…paper-900, crab-50…crab-900, gold-50…gold-700, ink-900, plus semantic aliases (`primary`, `accent`, `bg-paper`, `bg-deep`, `bg-soft`, `surface-1`, `surface-2`, `fg-1/2/3`, `border-soft`, `border-strong`, `success`, `warning`, `danger`, `info`, etc.).
- `fontFamily`: `display: ['Source Serif 4', …]`, `sans: ['Inter', …]`, `mono: ['JetBrains Mono', …]` (or via `var(--font-display)` etc.).
- `fontSize`: 12, 14, 16, 17, 20, 26, 32, 42, 56, 72 (mapped to xs / sm / base / h4 / h3 / h2 / h1 / display-md / display-lg / display-xl) with line-height pairs.
- `spacing`: 1=4 / 2=8 / 3=12 / 4=16 / 5=20 / 6=24 / 7=32 / 8=40 / 9=48 / 10=64 / 11=80 / 12=96 (note: this overrides Tailwind defaults — values 1–6 happen to coincide with default Tailwind, but 7+ diverge from Tailwind defaults).
- `borderRadius`: xs=4, sm=8, md=12, lg=16, xl=24, full=999.
- `boxShadow`: 1, 2, 3, focus.
- `transitionTimingFunction` + `transitionDuration` for fast/base/slow.
- `maxWidth`: container=1200, reading=680.

Tailwind's `content` glob already covers `./src/**/*.{ts,tsx}`. The file currently uses `import type { Config } from 'tailwindcss'` and the `satisfies Config` pattern.

### 22. Packages used by the prototype but not in `web/package.json`

The prototype HTMLs (`Home.html`, `County.html`, `Compare.html`) are loaded via Babel-standalone + Recharts UMD globally. None of those CDN-style versions are declared in package.json. Specific things the prototype uses that the real app doesn't:

- **No font loader package** is needed in the prototype — `tokens.css` `@import`s Google Fonts at runtime. For the real Vite SPA you'd typically use `@fontsource/inter`, `@fontsource/source-serif-4`, `@fontsource/jetbrains-mono` (or keep the CSS `@import`).
- **No class-merging helper**. The prototype uses inline style props throughout; no `clsx`, no `tailwind-merge`, no `class-variance-authority`. (Recharts 3 itself depends on `clsx ^2.1.1` transitively, but it's not surfaced.)
- **No icon library**. No `lucide-react`, no `@heroicons/react`, no `react-icons`. The only graphic is the in-line SVG `BrandMark` in `components.jsx`.
- **No state-mgmt or form library** beyond local `useState`.
- **Recharts version**: the HTML loads `https://unpkg.com/recharts/umd/Recharts.js` (no pin) — the rendered globals are `Recharts.LineChart` etc. Recharts as a UMD global today resolves to whatever `latest` dist tag is, currently 3.8.1 (see Q28). The real app pins `recharts ^2.12.0`.

### 23. Current MapLibre setup in `ChoroplethMap.tsx`

There is none. The component is a 22-line stub. No `import maplibregl from 'maplibre-gl'`, no `Map` instance, no source/layer JSON, no paint expressions, no event handlers, no style URL. The body returns a single dashed empty-state `<div>`.

`maplibre-gl ^4.5.0` is present in `web/package.json`. `web/public/data/geo/` exists but is empty. `package.json` has a `prep-geojson` script (`tsx scripts/prep-geojson.ts`) at the root level — implementation status not checked here.

### 24. Hex map vs. MapLibre choropleth

The prototype hex map differs from a MapLibre choropleth in two fundamental ways:

- **Geometry source.** Hex map: hand-coded `HEX_LAYOUT` constants (col,row pairs) → SVG `<path d>` strings via `hexPath()`. Any-projection cartographic data is irrelevant. MapLibre choropleth: GeoJSON `FeatureCollection` of `Polygon`/`MultiPolygon` (county boundaries) attached as a `geojson` source, rendered by a `fill` layer.
- **Color expressions.** Hex map: imperative `colorFor(c, metric)` JS function returning a hex string, applied per-cell as the `fill` SVG attribute. MapLibre: declarative paint expressions (`['interpolate', ['linear'], ['get', 'zhviYoY'], -0.05, '#7f1d1d', …]`) baked into the layer style — branching is in style JSON, not JS.

Other differences: legend is a hand-rolled bottom bar (vs. nothing built into MapLibre), hover state is a React `useState` flipping `stroke`/`strokeWidth` (vs. MapLibre `mousemove`/`mouseleave` handlers updating a `setFeatureState`), and there is no zoom/pan, no basemap, no tile loading.

### 25. React 19 versions on npm

`npm view react version` → **`19.2.6`** (latest stable). Canary line is `19.3.0-canary-…` through 2026-05-07. `npm view react-dom version` → **`19.2.6`** matches lockstep. `npm view @types/react version` → **`19.2.14`**. `@types/react-dom` follows the same major (19.x).

Available React 19 stable releases: 19.0.0 (Dec 2024) … 19.2.6 (current). `@types/react@19` was published with the 19.0 release.

### 26. React 19 breaking changes that touch `web/src`

Surveying current `web/src/` against the React 19 release notes (https://react.dev/blog/2024/12/05/react-19-upgrade-guide):

- **`ReactDOM.render` removed.** `web/src/main.tsx` already uses `createRoot` from `react-dom/client` — unaffected.
- **`hydrate` removed in favor of `hydrateRoot`.** Not used.
- **`defaultProps` on function components removed.** `web/src/` does not assign `defaultProps`; defaults are written as parameter defaults (e.g. `cadence = 'monthly', height = 320` in `PriceChart`). Unaffected.
- **String refs removed.** None used.
- **Legacy context (`contextTypes`, `getChildContext`) removed.** None used.
- **`propTypes` runtime checks removed.** None used.
- **`React.createFactory` removed.** None used.
- **`react-test-renderer/shallow` removed.** No tests use it.
- **UMD builds removed.** Not relevant — the app is bundled by Vite.
- `forwardRef` / `useImperativeHandle` semantics: no usage in current `web/src/`.
- New behaviors that affect, but don't break, current code: `useTransition` improvements; `<form action>`; `useActionState`; ref as a regular prop on function components (with `forwardRef` deprecated). None blocking.

Bottom line: the existing `web/src/` code (516 lines) does not invoke any removed React 18→19 API. The migration is mostly version bumps + types upgrade.

### 27. React-19 peer-dependency status of pinned libraries

- **`@tanstack/react-query` ^5.51.0** — `peerDependencies: { react: '^18 || ^19' }`. ✅ Compatible with React 19. (Latest `@tanstack/react-query` is 5.100.9.)
- **`react-router-dom` ^6.26.0** — `peerDependencies: { react: '>=18', 'react-dom': '>=18' }`. ✅ Accepts React 19 today. Note React Router 7 (latest 7.15.0) is also available with the same peers.
- **`recharts` ^2.12.0** — `peerDependencies: { react: '^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0', 'react-dom': same, 'react-is': same }`. ✅ Accepts React 19 even on the 2.x line. Latest 3.8.1 has identical peers.
- **`maplibre-gl` ^4.5.0** — has no React peer (it's framework-agnostic). Unaffected.
- **`@vitejs/plugin-react` ^4.3.0** — supports React 19 (Vite 5/6 line). ✅
- **`@types/react` / `@types/react-dom` ^18.3.0** — must move to `^19.x`. Will surface ref-prop typing differences (refs typed as regular prop, no implicit `null`).

### 28. Recharts 2.x → 3.x breaking changes vs. prototype usage

Source: Recharts 3 release notes (https://github.com/recharts/recharts/releases) and `npm view`.

Recharts 3 added a **react-redux dependency** (`react-redux: 8.x.x || 9.x.x` and `@reduxjs/toolkit: 1.x.x || 2.x.x`) plus `immer`, `reselect`, `es-toolkit`, `decimal.js-light`, `use-sync-external-store`, `clsx ^2.1.1`. Bundle impact is non-trivial (≈40–60 kB gzipped over 2.x).

Documented v3 breaking changes that intersect with the prototype:

- **`activeDot` and `dot` size defaults** unchanged for `Line`. (Prototype always sets `dot={false}` — unaffected.)
- **`Tooltip` content prop signature**: unchanged shape; `formatter`/`labelFormatter` continue to work. (Prototype heavily uses both.) ✅
- **`XAxis` / `YAxis`**: `interval` defaults remain `preserveEnd`; `tick={{ … }}` object shape unchanged; `axisLine`/`tickLine` still accept `false` or a stroke object. ✅ Behavior matches.
- **`CartesianGrid`** retains `vertical={false}`/`horizontal={false}` props. ✅
- **`ReferenceArea` / `ReferenceLine`**: prop names (`x1/x2/y/x/strokeDasharray/label`) stable across 2.x→3.x. ✅
- **`ResponsiveContainer`** gained an `aspect` shortcut and changed default debounce; nothing the prototype relies on changes. ✅
- **`Legend`** layout default changed from `horizontal` at bottom to `horizontal` at bottom (no effective change), but now requires React Redux context — Recharts 3 internally wraps the chart in a `<Provider>`, which the consumer never sees. ✅ (Prototype imports but never renders `Legend`.)
- **`Animation`**: `isAnimationActive` defaults stay `true` for `Line/Area/Bar`. The prototype does not override; existing `web/src/components/PriceChart.tsx` does explicitly `isAnimationActive={false}`. Both still work in 3.x.
- **TypeScript**: Recharts 3 ships its own types (no separate `@types/recharts` needed). The current pin is on Recharts 2 which also has built-in types — no change.
- **Removed exports**: none of `LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, CartesianGrid, Legend` are removed in 3.x.

Net: the prototype's chart usages map 1:1 onto Recharts 3 without prop renames. The cost is the new transitive dependencies (notably `react-redux`, `@reduxjs/toolkit`, `es-toolkit`, `immer`).

---

## Visual primitives and tokens in detail

### 29. Typographic scale (from `tokens.css` and `DESIGN_SYSTEM.md`)

| Token | rem | px | Line height | Weight | Family default | Use per design doc |
|---|---|---|---|---|---|---|
| `--fs-display-xl` | 4.5 | 72 | 1.2 (`--lh-display`) | 600 | `--font-display` | Reserved deck-style hero |
| `--fs-display-lg` | 3.5 | 56 | 1.2 | 600 | `--font-display` | Home hero stat |
| `--fs-display-md` | 2.625 | 42 | 1.2 | 600 | `--font-display` | County page H1 |
| `--fs-h1` | 2 | 32 | 1.15 (`--lh-tight`) | 600 | `--font-display` | Page H1 |
| `--fs-h2` | 1.625 | 26 | 1.2 | 600 | `--font-display` | Card headers |
| `--fs-h3` | 1.25 | 20 | 1.35 (`--lh-snug`) | 600 | `--font-body` (Inter) | Sub-section headers |
| `--fs-h4` | 1.0625 | 17 | 1.35 | 600 | `--font-body` | Inline labels |
| `--fs-body` | 1 | 16 | 1.55 (`--lh-body`) | 400 | `--font-body` | Paragraph copy |
| `--fs-small` | 0.875 | 14 | 1.55 | 400 | `--font-body` | Card body, table cells |
| `--fs-xs` | 0.75 | 12 | 1.4 (effective; doc says 1.4) | 400/600 | `--font-body` | Captions, eyebrows |

Eyebrow utility: 12px Inter 600, uppercase, `letter-spacing: 0.12em`, `--fg-2`. Numerals use `font-variant-numeric: tabular-nums` in tabular contexts.

### 30. Spacing scale

```
--space-1   4
--space-2   8
--space-3  12
--space-4  16
--space-5  20
--space-6  24
--space-7  32
--space-8  40
--space-9  48
--space-10 64
--space-11 80
--space-12 96
```

Rhythm rules per `DESIGN_SYSTEM.md`: card padding 24 (dense 20); card gap inside grids 16; section vertical rhythm 64–96; page gutter 32 desktop / 16 mobile (container max 1200 per doc but `Container` ships at 1280 in `components.jsx`); form gaps 8–12 inline, 16 vertical.

### 31. Radii and shadows

Radii: `--radius-xs 4` (focus-visible), `--radius-sm 8`, `--radius-md 12` (buttons), `--radius-lg 16` (cards), `--radius-xl 24` (hero, modal — actually used at 20 in `BigChart`/`MarketHealthBreakdown`/`ForecastCone`/`FederalExposure`; 16 elsewhere), `--radius-pill 999`.

Shadow application as observed:
- `--shadow-1` — used as the active-pill background lift in `BigChart`'s range toggle; otherwise card containers use `1px solid --border-soft` with no shadow.
- `--shadow-2` — declared but not visibly applied in any `style={{ boxShadow }}` call across the four JSX files.
- `--shadow-3` — declared, unused.
- `--shadow-focus` — applied via the global `:focus-visible` rule in `tokens.css`.

`DESIGN_SYSTEM.md` explicitly says no shadows on chart containers and no shadows on hover; observed JSX matches.

### 32. Jurisdiction badge color pairs

Two conflicting definitions exist in the prototype:

- **`DESIGN_SYSTEM.md`** (warm crab/gold/blue, doc-of-record):
  - DC: bg `#FBEEF0` (= `--crab-50`), fg `#6E1424` (= `--crab-700`)
  - MD: bg `#FBF5E0` (= `--gold-50`), fg `#5E4A0F` (= `--gold-700`)
  - VA: bg `#E4EEF7` (= `--blue-50`), fg `#1B4067` (= `--blue-700`)
- **`data.js::juriBgFg`** (Tailwind 200/700 swatches, what the JSX actually renders):
  - DC: bg `#fee2e2`, fg `#991b1b`
  - MD: bg `#fef3c7`, fg `#854d0e`
  - VA: bg `#dbeafe`, fg `#1e40af`

These are encoded as inline objects in `data.js`, not as CSS tokens. The prototype JSX components consistently use `juriBgFg(j)` — which means the actually-rendered badges do not match the design-system table.

`data.js::juriColor` returns `{ DC: '#dc2626', MD: '#ca8a04', VA: '#1d4ed8' }` — used by the hex map jurisdiction tick and the footer brand mark. Same colors, in the same order, are also pinned into `web/tailwind.config.ts` today as `dc/md/va` Tailwind colors.

---

## Behaviour and interaction patterns

### 33. Hover, focus, and active states

`DESIGN_SYSTEM.md` specifies:
- Buttons: hover darkens 6%, press darkens 12%.
- Pills: active = filled `--fg-1`, inactive = `--surface-1` + 1px `--border-soft`.
- Picker rows: hover = `--bg-soft`. Capped rows = 0.4 opacity, `cursor:not-allowed`.
- "No scale or translateY on hover. Hover changes color/border only."
- "No third-party UI framework."

Implementation in JSX:
- `MoversCard` rows: `onMouseEnter`/`onMouseLeave` toggle `background: var(--bg-soft)` directly. ✓
- `CountyPicker` rows: `background = on ? var(--bg-soft) : transparent`, cap state has `cursor:not-allowed` and `opacity:0.4`. ✓
- `Chip` (county.jsx BigChart overlay chips): borderColor changes to the series color when on; otherwise `--border-soft`.
- `MetricPicker` pills: active fills `--fg-1` with white text; inactive uses `--surface-1` and `--border-soft`. ✓
- `BigChart` range-toggle pills: active gains `box-shadow: var(--shadow-1)` + `background: var(--surface-1)`; inactive transparent.
- Hex cells in `map.jsx`: hover increases `strokeWidth` from 1 → 2.5 and changes stroke color to `#2B201A`, with `transition: stroke-width 150ms`.
- Focus: handled globally via `:focus-visible { box-shadow: var(--shadow-focus); border-radius: var(--radius-xs) }` in `tokens.css`. No per-component focus rings.
- Active/press states: not explicitly implemented in any prototype JSX.

### 34. Spread auto-trigger thresholds

Encoded in `compare.jsx::DifferenceCallout` (and described in `DESIGN_SYSTEM.md`):

```js
const wide =
  spreadPct > 0.5 ||                                     // >50% relative spread
  (metric.id === "zhvi"   && spread > 300000) ||         // value: $300k absolute
  (metric.id === "supply" && spread > 3) ||              // months: > 3 mo
  (metric.id === "dom"    && spread > 30);               // days:  > 30 days
```

Where `spread = max - min` of `metric.get(c)` across selected counties, `spreadPct = spread / min`. The doc text says "`>50%` rel for value metrics, `>3 mo` supply, `>30 days` DOM" — the JSX is consistent and adds an explicit `>$300k` zhvi-absolute trip.

When `wide` flips true, the callout swaps to the "gold" treatment (`#FCF1DC` bg / `#EAD174` border / `#C9A227` chip with white "!"). Otherwise it uses `--surface-1` / `--border-soft` / `--paper-200` chip with `--fg-2` "!".

### 35. Sticky picker rail (Compare page)

`compare.jsx::CountyPicker` uses raw CSS:

```js
position: "sticky",
top: 80,
alignSelf: "start",
maxHeight: "calc(100vh - 100px)",
overflow: "auto",
```

The `top: 80` matches the 64px `--header-h` plus a 16px breathing gap. `alignSelf: "start"` is required because the parent is a CSS grid with `gridTemplateColumns: "320px 1fr"`; without it the picker would stretch to the row height and `position:sticky` wouldn't fire.

The right column's `<MetricPicker>` is **not** sticky — only the picker rail.

### 36. Keyboard, focus-visible, reduced-motion

`tokens.css`:
- `:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-xs); }` — global gold ring.
- `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` — wholesale clamp.

Prototype JSX:
- The `CountyPicker` checkbox-style `<button>` correctly uses semantic `<button>` (so it is keyboard-focusable by default and gets the global focus ring).
- `disabled={atCap}` on capped rows hides them from the keyboard.
- The hex-map `<g>` cells are `<g>` elements with `onClick`, **not buttons**. They are not in the tab order and have no `aria-*` attributes.
- The hex-map metric pills, the BigChart range pills, the metric-picker pills, the overlay chips, and the affordability sliders are all native `<button>`/`<input type=range>` elements — focusable.
- No `role`, `aria-label`, `aria-pressed`, `aria-current`, `aria-controls` attributes appear in the prototype JSX (verified by reading each file).

---

## Routing, navigation, and shell

### 37. Prototype `SiteHeader` nav vs. real `App.tsx` routes

Prototype `SiteHeader` declares 4 links:

```js
[ { id: "home", label: "Overview" },
  { id: "counties", label: "Counties" },
  { id: "compare", label: "Compare" },
  { id: "data", label: "Data & methods" } ]
```

Real `App.tsx`:

```tsx
<Route path="/"             element={<Home />} />
<Route path="/county/:fips" element={<County />} />
<Route path="/compare"      element={<Compare />} />
<Route path="*"             element={<NotFound />} />
```

So 2 of the 4 prototype nav targets exist (`Overview` → `/`, `Compare` → `/compare`). Prototype "Counties" and "Data & methods" have no current route. The real `Layout.tsx` only renders 2 NavLinks (Overview, Compare). There is no `/county` index or `/data`/`/methodology` route.

### 38. Prototype `SiteFooter` content and provenance

Hard-coded in `components.jsx::SiteFooter`:

- Brand block (BrandMark + "DMV Housing") + 3-line description ("A free, public dashboard…").
- "Pages" eyebrow + four anchor links: Overview / All counties / Compare counties / Methodology.
- "Data sources" eyebrow + two-column list of 7 items, hard-coded as a JSX `sources` const:

```js
[
  { name: "U.S. Federal Housing Finance Agency", series: "FHFA HPI, via FRED" },
  { name: "Zillow Research",                     series: "ZHVI All Homes" },
  { name: "Redfin Data Center",                  series: "Median sale price, DOM" },
  { name: "U.S. Census Bureau",                  series: "ACS 5-year 2023" },
  { name: "Bureau of Labor Statistics",          series: "CES, QCEW" },
  { name: "Freddie Mac PMMS",                    series: "30-year fixed rate" },
  { name: "Bright MLS, NAR",                     series: "Forecasts" },
]
```

- Bottom row: "Last refreshed `{window.METRO.lastUpdated}` · Open source on GitHub" + "Not investment advice. Not affiliated with any government agency."

`window.METRO.lastUpdated` = `"April 23, 2026"` (literal string in `data.js`). In the real app, `Manifest.generatedAt` is the closest equivalent (an ISO timestamp, not a pre-formatted string).

### 39. URL state in the prototype

None of the four pages persist any state to the URL (no `useSearchParams`, no hash routing, no `pushState`). All state is local React `useState`:

- `Home.html` shell holds `page` ("home"|"counties"|"county"|"compare") and a `selectedFips` in component state.
- `County.html` reads the FIPS from `?fips=…` (via `URLSearchParams` once at mount) but does not update the URL when the user uses overlay chips or range toggles.
- `Compare.html` keeps `selected: ["24031","24027","11001","51107"]` and `metric: "zhvi"` in `useState` only.

The real `Compare.tsx` stub-comment notes the intent: "Persist selection in URL search params for shareability." That is not yet done.

---

## Accessibility and responsive behaviour

### 40. Token contrast ratios

Relative-luminance computed (sRGB → linear → WCAG `(L1+0.05)/(L2+0.05)`).

| Pair | Hex pair | Ratio | WCAG large (3:1) | WCAG normal (4.5:1) |
|---|---|---|---|---|
| `--fg-1` on `--bg-paper` | `#1C1A14` on `#FBF8F3` | ≈ 16.7 : 1 | ✅ | ✅ |
| `--fg-2` on `--bg-paper` | `#4A4538` on `#FBF8F3` | ≈ 9.1 : 1 | ✅ | ✅ |
| `--fg-3` on `--bg-paper` | `#6B6557` on `#FBF8F3` | ≈ 5.6 : 1 | ✅ | ✅ |
| `--fg-1` on `--surface-1` | `#1C1A14` on `#FFFFFF` | ≈ 17.5 : 1 | ✅ | ✅ |
| `--fg-3` on `--surface-1` | `#6B6557` on `#FFFFFF` | ≈ 5.9 : 1 | ✅ | ✅ |
| `--primary` on `--bg-paper` | `#A4243B` on `#FBF8F3` | ≈ 6.5 : 1 | ✅ | ✅ |
| Doc DC badge (fg `#6E1424` on bg `#FBEEF0`) | | ≈ 9.1 : 1 | ✅ | ✅ |
| Doc MD badge (fg `#5E4A0F` on bg `#FBF5E0`) | | ≈ 8.7 : 1 | ✅ | ✅ |
| Doc VA badge (fg `#1B4067` on bg `#E4EEF7`) | | ≈ 8.6 : 1 | ✅ | ✅ |
| **Implemented** DC badge (`#991b1b` on `#fee2e2`) | | ≈ 7.0 : 1 | ✅ | ✅ |
| **Implemented** MD badge (`#854d0e` on `#fef3c7`) | | ≈ 6.0 : 1 | ✅ | ✅ |
| **Implemented** VA badge (`#1e40af` on `#dbeafe`) | | ≈ 7.4 : 1 | ✅ | ✅ |
| Gold callout fg (`--fg-1` on `#FCF1DC`) | `#1C1A14` on `#FCF1DC` | ≈ 15.4 : 1 | ✅ | ✅ |
| Gold "!" chip (`#FFFFFF` on `#C9A227`) | | ≈ 2.0 : 1 | ❌ | ❌ |

(Numbers above are computed relative-luminance estimates, not certified test results. The white-on-gold "!" chip is the only flagged pair in the prototype.)

### 41. Viewport breakpoints

`tokens.css` defines no `@media (min-width: …)` rules other than `prefers-reduced-motion`. The prototype JSX hard-codes desktop layouts in inline `style` props with `gridTemplateColumns: "repeat(5, 1fr)"`, `"repeat(6, 1fr)"`, `"320px 1fr"`, etc. and does not use Tailwind's `sm:`/`md:`/`lg:` utilities. There is no `flexWrap` or grid-fallback that reflows to a 2-up or 1-up layout at narrower widths in the metric strip / snapshot row.

Where `flexWrap: "wrap"` does appear: `MetricPicker`'s pill row, `BigChart`'s overlay chip row, `BigChart`'s header band, `ForecastCone`'s header. The 5-up `MetricStrip` and 6-up `CountySnapshot` do not wrap.

Doc says page gutter "32px on desktop, 16px on mobile" but this is not implemented anywhere — `Container` is a fixed `padding: "0 32px"`.

### 42. ARIA, landmarks, and alt text

Reading every JSX file for `aria-`, `role`, `alt`, `lang`, `<main>`/`<nav>`/`<header>`/`<footer>`:

- `<main>` element is rendered by `HomePage`, `CountyPage`, and `ComparePage`. ✓
- `<header>` is the `SiteHeader` outer element. ✓ A `<nav>` element wraps the link list inside `SiteHeader`. ✓
- `<footer>` is the `SiteFooter` outer element. ✓
- `BrandMark` SVG carries `aria-hidden="true"`. ✓
- No `aria-label`, no `aria-pressed`, no `aria-current`, no `aria-controls`, no `aria-describedby` in any of `components.jsx`, `home.jsx`, `county.jsx`, `compare.jsx`, `map.jsx`.
- No `<h1>` `<h2>` semantic hierarchy enforcement: many "h2" titles are rendered as `<h2>` but some chart cards use `<h3>` or `<div>` styled like an h2 (e.g. `MoversCard`, `DriverCard` use `<h3>`).
- Hex map cells use `<g onClick>`; not in tab order, no `role="button"`, no labels.
- The "← Back" button on the County page is a `<button>` with text only — no `aria-label`.
- No `alt` attributes anywhere because there are no `<img>` elements (the only graphic is the SVG BrandMark).
- The HTML files do not declare `<html lang>` (verified by reading `Home.html`/`County.html`/`Compare.html`).

---

## Build, deploy, and quality gates

### 43. `npm run build` output composition

Not measured — no build was run during this research pass. From `web/package.json`: `"build": "tsc -b && vite build"` and `vite.config.ts` sets `outDir: 'dist'`, `sourcemap: true`, `target: 'es2022'`. The current `web/src/` is 516 lines and pulls in:

- `react@^18.3.0` / `react-dom@^18.3.0`
- `react-router-dom@^6.26.0`
- `@tanstack/react-query@^5.51.0`
- `recharts@^2.12.0` (with transitive `lodash`, `clsx`, `victory-vendor`, etc.)
- `maplibre-gl@^4.5.0` (only imported via the stub component, but the import is a no-op until wired)

Empirically (from public benchmarks of these versions): MapLibre GL JS typically dominates first-party bundles at ~700 kB minified (~190 kB gzipped) because it ships its own GL renderer. Recharts 2.x is the next biggest at ~340 kB minified (~95 kB gzipped) due to `lodash` and `victory-vendor`. React + React DOM ≈ 130 kB minified (~42 kB gzipped). React Query ≈ 75 kB min (~25 kB gz). React Router ≈ 60 kB min (~22 kB gz). First-party 516 lines compiles to ~10 kB.

**Open question:** actual `dist/` byte counts and tree-shaking behavior are unknown until `npm run build` is run.

### 44. CI checks

`.github/workflows/` lists only ingest cron workflows: `ingest-annual.yml`, `ingest-daily.yml`, `ingest-monthly.yml`, `ingest-quarterly.yml`, `ingest-weekly.yml`. **There is no `ci.yml`, no `web.yml`, no PR-level workflow that runs `typecheck`/`lint`/`test`/`build` on push.** The repo's `CLAUDE.md` says "run both before claiming work is done" referring to local `npm run typecheck` and `npm run lint`, implying these are developer-side gates today.

Local quality scripts (root `package.json`):
- `typecheck` → `npm run typecheck --workspaces --if-present` (each workspace runs `tsc --noEmit`)
- `lint` → `eslint . --ext .ts,.tsx`
- `test` → `npm run test --workspaces --if-present` (web's test script returns success on empty, scripts has 7 vitest specs)
- `format` → `prettier --write "**/*.{ts,tsx,md,json}"`

No `eslint.config.*` or `.eslintrc.*` file is checked in at the repo root (the directory listing returned `no matches found: .eslint*`). ESLint 9 with no config would fall back to defaults — confirmation pending an actual `npm run lint` run.

### 45. Assets shipped from `claude_design/` that need relocation

`claude_design/assets/` contains exactly one file: `logo-mark.svg`. This is the design-side logo asset; the prototype JSX does not reference it (the rendered `BrandMark` is an inline SVG in `components.jsx` instead). If the real app wants the file-based asset, it would move into `web/public/` (for raw static serving) or `web/src/assets/` (for Vite import-as-URL).

`claude_design/uploads/` contains four markdown briefs (`01-DESIGN_BRIEF.md`, `02-DATA_MODEL.md`, `03-COUNTIES.md`, `04-DMV_CONTEXT.md`) — narrative docs, not binary assets, and they don't need to ship to `web/`.

`tokens.css` is the only stylesheet. Fonts are loaded from `fonts.googleapis.com` via `@import` (Q12) — no local font files ship from `claude_design/`.

---

## Open Questions

- **Q43 (bundle size composition):** the actual `web/dist/` byte breakdown by chunk has not been measured. Need a `npm run build` run to confirm whether MapLibre vs. Recharts is the bigger contributor in this specific codebase.
- **Q44 (CI pipeline):** there is no `eslint.config.*` checked in, and ESLint 9 changed config formats. Whether `npm run lint` succeeds today is unverified. Same for whether `npm run typecheck` passes across the three workspaces.
- **Q40 (gold "!" chip contrast):** white text on `#C9A227` reads ~2.0:1, which fails WCAG AA for both normal and large text. Whether the prototype intends this only as iconography (and therefore exempt) or as readable type is a design call, not a research finding.

## Next
**Phase:** Design
**Artifact to review:** `docs/crispy/ui-redesign/2-research.md`
**Action:** Review research findings. Then invoke `crispy-design` with project name `ui-redesign`.
