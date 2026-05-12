# Delivery

Project: **ui-redesign**
Workflow: CRISPY (Questions → Research → Design → Outline → Plan → Implement → Delivery)
Final commit on branch: `0a3996c fix(ci): build @dmv/shared before typecheck`

---

## Summary

The DMV Housing Hub frontend was rebuilt against the warm-paper, editorial design system in `claude_design/`. The work spanned eight vertical slices that each landed as a self-contained PR: a CI/lint/bundle baseline; a Tailwind ↔ design-token bridge with web-font wiring; transform-side derived fields (market-health score, affordability index, property-tax rate, population) committed alongside the county JSON; a redesigned Home page with hero, metro snapshot strip, biggest-movers, and "what's driving" panels; an interactive map of the 21 DMV jurisdictions; a redesigned County page with snapshot grid, long-run HPI chart, live affordability sliders, and market-health breakdown; a Compare page with sticky picker rail, metric switcher, ranked table, and URL-encoded state; and a `/counties` index plus `/methodology` static page so every header link resolves.

The map slice deviated from the original plan: MapLibre was replaced with an SVG hex cartogram (`d241454`) so all 21 jurisdictions read at the same visual weight regardless of land area, and the bundle stays well under the 500 kB gz budget without lazy-loading. The stack also upgraded mid-flight to React 19 + Recharts 3 (`1746acd`) to unblock peer-dep alignment with the new chart and form primitives.

---

## Changes

### CI & tooling
- `eslint.config.js` — flat config wiring `@eslint/js`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`.
- `.github/workflows/ci.yml` — typecheck → lint → test → build → bundle-size, with a `build @dmv/shared` step before typecheck (`0a3996c`).
- `scripts/check-bundle-size.ts` — gzip every chunk in `web/dist/assets/`, fail at 500 kB gz, print headroom.

### Design tokens & shell
- `web/src/styles/tokens.css` — port of `claude_design/tokens.css`, Google-Fonts `@import` removed.
- `web/src/index.css`, `web/src/main.tsx` — Tailwind directives + `@fontsource` for Inter / Source Serif 4 / JetBrains Mono.
- `web/tailwind.config.ts` — full token map (paper/crab/gold/ink ramps, semantic aliases, fonts, spacing, shadows, max-widths).
- `web/src/components/Layout.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx`, `JurisdictionBadge.tsx`, `MetricCard.tsx`, `Card.tsx`, `Container.tsx`, `Source.tsx`, `BrandMark.tsx`, `SectionHeader.tsx`, `InsufficientData.tsx`.

### Transform pipeline (Slice 3)
- `shared/src/types.ts` — added `propertyTaxRate`, `population`; added `'population'` to `MetricId`.
- `scripts/lib/property-tax-rates.ts` — 21 FIPS → decimal rate, with per-row source citations.
- `scripts/lib/populations.ts` — reads `B01003_001E` from `scripts/.cache/census.json`.
- `scripts/transform/marketHealth.ts` — weighted composite score, ≥3-of-4 inputs.
- `scripts/transform/affordability.ts` — PITI-over-income ratio.
- `scripts/transform/build-county-pages.ts` — loads mortgage rate first, computes derived fields per county.

### Home page (Slice 4)
- `web/src/pages/Home.tsx` — `useQueries` for 21 counties + `useQuery` for mortgage rates.
- `web/src/components/home/Hero.tsx`, `MetricStrip.tsx`, `HealthCard.tsx`, `BiggestMovers.tsx`, `MoversCard.tsx`, `WhatsDriving.tsx`, `DriverCard.tsx`.
- `web/src/lib/metro.ts`, `web/src/lib/colors.ts`, `web/src/lib/fips.ts`.

### Map (Slice 5, deviated)
- `web/src/components/ChoroplethMap.tsx` — replaced MapLibre implementation with an SVG hex cartogram (`d241454`); each county is an equal-size hex tile, hover side-rail and click-to-navigate preserved.
- `web/src/lib/color-scales.ts`, `web/src/lib/map-style.ts` — kept for diverging/sequential/categorical color logic.
- `scripts/prep-geojson.ts` — left in place but no longer required at runtime.

### County page (Slice 6)
- `web/src/pages/County.tsx` (+ `County.test.tsx`).
- `web/src/components/county/CountyHeader.tsx`, `SnapshotGrid.tsx`, `BigChart.tsx`, `NeighborChip.tsx`, `Affordability.tsx`, `MarketHealthBreakdown.tsx`, `ForecastCone.tsx`, `FederalExposure.tsx`.
- `web/src/lib/affordability-calc.ts` — shared between the static index and the live sliders.

### Compare page (Slice 7)
- `web/src/pages/Compare.tsx`.
- `web/src/hooks/useCompareState.ts` (+ `useCompareState.test.tsx`).
- `web/src/lib/compare-metrics.ts` — six metrics with `get()` accessors.
- `web/src/components/compare/CountyPicker.tsx`, `MetricPicker.tsx`, `CompareChart.tsx`, `RankedTable.tsx`, `DifferenceCallout.tsx`, `EmptyState.tsx`.
- Compare page later refined to match prototype labels and county short names (`96ab608`).

### Index + methodology (Slice 8)
- `web/src/pages/Counties.tsx` (+ `Counties.test.tsx`) — search + DC/MD/VA grouped grid.
- `web/src/pages/Methodology.tsx` — static JSX (no MDX dep) covering data sources, market-health and affordability methodology, pipeline architecture, limitations.
- `web/src/App.tsx` — `/counties` and `/methodology` routes.
- `SiteHeader.tsx` — `aria-current="page"` driven by `useLocation()`.

### Cross-cutting follow-ups
- React 19 + Recharts 3 upgrade (`1746acd`).
- MapLibre StrictMode double-init guard + error boundary, then superseded by the cartogram (`e13be26`, `df44095`).

---

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` (all workspaces) | ✅ clean |
| `npm run lint` | ✅ clean |
| `npm run test --workspace=web` | ✅ 17 / 17 passing |
| Bundle size (500 kB gz per chunk) | ✅ within budget |
| Header nav links (`/`, `/counties`, `/compare`, `/methodology`) | ✅ all resolve |
| Sparse-county rendering (24510, 51600) | ✅ honest `<InsufficientData />` / `—` fallbacks |
| URL round-trip on `/compare` | ✅ paste-link reproduces selection + metric |

Each slice's checkpoint passed in `6-implement.md`; no slice was skipped or deferred.

---

## Remaining items

- **Federal-employment exposure.** `FederalExposure` and the "Federal" driver card on Home still render `<InsufficientData />`. Unblocking work: ingest BLS QCEW federal-government employment by county.
- **Forecast cone.** `ForecastCone` renders `<InsufficientData />`. Unblocking work: decide on a forecast source (FHFA expectations? in-house ARIMA?) and add an ingester.
- **Methodology page is static prose, not MDX.** The plan called for MDX; we copied curated subsets of `claude_design/uploads/02-DATA_MODEL.md` and `04-DMV_CONTEXT.md` into JSX literals to avoid adding `@mdx-js/rollup`. If the methodology grows, revisit MDX.
- **Choropleth ↔ cartogram tradeoff.** The hex cartogram makes all 21 jurisdictions equally legible but loses geographic adjacency. If geographic intuition matters more than parity, the MapLibre implementation is preserved in git history (`d241454^`).
- **County-page market-health breakdown** recomputes sub-scores client-side from `current.{monthsSupply, saleToListRatio, pctSoldAboveList}`. If the weighted decomposition needs to be authoritative, persist sub-scores in the transform output.

---

## How to use

**Local development**
```bash
npm install
npm run dev          # Vite at http://localhost:5173
```

**Quality gates** (run before opening a PR)
```bash
npm run typecheck
npm run lint
npm run test
npm run build && npm run check-bundle-size
```

**Refresh data** (requires API keys — see `CLAUDE.md`)
```bash
FRED_API_KEY=… CENSUS_API_KEY=… BLS_API_KEY=… \
  npm run ingest --workspace=scripts
npm run transform --workspace=scripts
```

**Routes**
- `/` — DMV cartogram + metro snapshot, biggest movers, what's driving the market.
- `/county/:fips` — single-county detail (snapshot grid, long-run HPI, affordability sliders, market-health breakdown).
- `/compare?counties=24031,11001&metric=zhvi` — up to 5 counties; URL is the source of truth.
- `/counties` — searchable index grouped by jurisdiction.
- `/methodology` — data sources, formulas, limitations.

**Adding a new metric to `/compare`** — append a `CompareMetric` to `web/src/lib/compare-metrics.ts`; the picker, chart, and ranked table pick it up automatically.

---
✅ **CRISPY workflow complete.** All artifacts are in `docs/crispy/ui-redesign/`.
