# Implementation Log

Project: ui-redesign  
Date: 2026-05-08  
Status: **All 8 slices complete**

---

## Slice 1 — CI / ESLint baseline

**Done:** Rewrote `eslint.config.js` to flat config with `@eslint/js`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`. Created `.github/workflows/ci.yml` (typecheck → lint → test → build → bundle-size). Created `scripts/check-bundle-size.ts` (500 kB gz per chunk limit).

**Checkpoint:** PASS — `npm run lint` clean; CI workflow file present.

---

## Slice 2 — Design-token bridge

**Done:** Copied `claude_design/tokens.css` → `web/src/styles/tokens.css` (removed Google Fonts `@import`). Rewrote `web/src/index.css` to import tokens then Tailwind. Rewrote `web/tailwind.config.ts` with full token mapping (paper/crab/gold/ink ramps, semantic aliases, fonts, spacing, shadows). Added `@fontsource/inter`, `@fontsource/source-serif-4`, `@fontsource/jetbrains-mono` imports in `main.tsx`.

**Checkpoint:** PASS — typecheck and lint clean; Tailwind classes compile against token values.

---

## Slice 3 — Transform-side computed fields

**Done:** Added `propertyTaxRate` and `population` to `CountySummary` in `shared/types.ts`. Added `'population'` to `MetricId`. Created `scripts/lib/property-tax-rates.ts` (21 FIPS → decimal rate), `scripts/lib/populations.ts` (reads census.json), `scripts/transform/marketHealth.ts` (weighted composite, ≥3-of-4 rule), `scripts/transform/affordability.ts` (PITI/income ratio). Modified `build-county-pages.ts` to load mortgage rate first, then compute all four derived fields per county.

**Checkpoint:** PASS — `npm run typecheck --workspace=scripts` clean.

---

## Slice 4 — Home page redesign

**Done:** Rewrote `MetricCard.tsx` (raw `change` number, internal formatting). Created `JurisdictionBadge.tsx`, `SiteHeader.tsx` (sticky, blur), `SiteFooter.tsx` (with `FOOTER_SOURCES`), `Layout.tsx`. Created `web/src/lib/fips.ts` (`DMV_FIPS` array), `web/src/lib/colors.ts`, `web/src/lib/metro.ts`, `web/src/lib/map-style.ts`, `web/src/lib/color-scales.ts`. Updated `web/src/api.ts` to add `getMortgageRates()`.

**Checkpoint:** PASS — typecheck, lint, existing Home test green.

---

## Slice 5 — MapLibre choropleth

**Done:** Rewrote `ChoroplethMap.tsx` (~150 lines): MapLibre map init, GeoJSON source with `promoteId: 'fips'`, `dmv-fill` + `dmv-outline` layers, hover side-rail, click-to-navigate, metric switcher pills. Fixed `react-hooks/exhaustive-deps` with `countiesRef` pattern. Lazy-loaded from `Home.tsx` via `React.lazy`. Modified `scripts/prep-geojson.ts` to normalize properties to `{ fips, name, jurisdiction }`. Rewrote `Home.tsx` with separate `useQueries` (counties) and `useQuery` (mortgage rates).

**Checkpoint:** PASS — both chunks under 500 kB gz; typecheck and lint clean.

---

## Slice 6 — County page rewrite

**Done:** Created `web/src/components/county/` tree: `CountyHeader`, `SnapshotGrid`, `BigChart` (with `NeighborChip`), `Affordability` (3 sliders, live PITI calc), `MarketHealthBreakdown` (donut SVG + sub-rows), `ForecastCone` (InsufficientData stub), `FederalExposure` (InsufficientData stub). Created `web/src/lib/affordability-calc.ts`. Added `data-testid="insufficient-data"` to `InsufficientData.tsx`. Added `ResizeObserver` mock to `test-setup.ts`. Created `County.test.tsx` (2 tests: full county + sparse county).

**Deviations:**
- Fixed React Compiler `preserve-manual-memoization` lint error in `BigChart.tsx` by destructuring `county` into `countyFips` + `countyCurrentMetrics` so deps matched compiler inference.

**Checkpoint:** PASS — 9/9 tests green; typecheck and lint clean.

---

## Slice 7 — Compare page with URL state

**Done:** Created `web/src/lib/compare-metrics.ts` (6 `CompareMetric` entries). Created `web/src/hooks/useCompareState.ts` (`useSearchParams`-backed hook, cap-at-5 enforcement). Created `web/src/components/compare/`: `CountyPicker` (sticky rail, search, jurisdiction groups, disabled-at-cap), `MetricPicker` (pill row with `aria-pressed`), `CompareChart` (last-60-month FHFA HPI overlay), `RankedTable` (sorted + inline progress bar), `DifferenceCallout` (gold callout when spread exceeds threshold), `EmptyState`. Rewrote `Compare.tsx`. Added `useCompareState.test.tsx` (5 tests: parse URL, default metric, toggle add, toggle remove, cap-at-5).

**Checkpoint:** PASS — 15/15 tests green; typecheck and lint clean.

---

## Slice 8 — `/counties` index and `/methodology` static page

**Done:** Created `Counties.tsx` (search filter, DC/MD/VA grouped card grid, `CountyCard` sub-component). Created `Methodology.tsx` (static JSX: data sources table citing all `FOOTER_SOURCES`, market health methodology, affordability methodology, pipeline architecture, limitations). Wired both routes in `App.tsx`. Added `Counties.test.tsx` (2 tests: renders all counties, search filters). Installed `@testing-library/user-event`.

**Checkpoint:** PASS — 17/17 tests green; typecheck and lint clean.

---

## Summary

All 8 slices complete. No checkpoints failed. Final state:

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ clean (all workspaces) |
| `npm run lint` | ✅ clean |
| `npm run test --workspace=web` | ✅ 17/17 passing |
| Bundle size | ✅ both chunks under 500 kB gz |
| Header nav links | ✅ all 4 routes resolve |

## Next

**Phase:** Delivery  
**Artifact to review:** `docs/crispy/ui-redesign/6-implement.md`  
**Action:** Review the implementation log. Then invoke `crispy-delivery` with project name `ui-redesign`.
