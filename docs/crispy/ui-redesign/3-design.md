# Design

## Current State

`web/src/` is 516 lines across 13 files. Layout/Home/County render real data; Compare and ChoroplethMap are stubs. Styling is ad-hoc Tailwind utilities with `theme.extend` carrying only three jurisdiction colors and no token bridge. Fonts default to a system stack. Charts use Recharts 2.x with neutral grey axis defaults. React is pinned to 18.3, Recharts to 2.12.

The new design (`claude_design/`) is built around `tokens.css` (CSS variables: warm paper palette + Crab Red + Old Bay Gold; Source Serif 4 / Inter / JetBrains Mono; 12-step spacing; 6 radii; 3 shadows; reduced-motion media query), three Google fonts loaded via `@import`, and inline-style React components rendered through a Babel-standalone HTML harness. There are roughly two dozen prototype components across five JSX files — most extend a small set of primitives (`Container`, `Card`, `MetricCard`, `JurisdictionBadge`, `SectionHeader`, `SiteHeader`, `SiteFooter`, `Source`).

Data side: 21 county JSONs match the canonical `CountySummary` shape, but only `current.{zhvi, zhviYoY, medianSalePrice, medianSalePriceYoY, daysOnMarket, monthsSupply, saleToListRatio, pctSoldAboveList, unemploymentRate}` and `series.{fhfaHpi, zhvi, medianSalePrice, daysOnMarket, activeListings}` are populated. Two counties (24510, 51600) ship sparse blocks. The prototype consumes additional fields not in any committed JSON: `marketHealth`, `affordability`, `fedExposure`, `propertyTaxRate`, `population`, a `federal.series`, mock `forecasts[]`, a `summary` blurb, and a metro snapshot (`window.METRO`) with no JSON equivalent.

## Desired End State

Five production routes (`/`, `/county/:fips`, `/compare`, `/counties`, `/methodology`) rendered with the new design system, on the existing static-only Cloudflare Pages stack. Specifically:

- `tokens.css` is the source of truth for colors, type, spacing, radii, shadows; Tailwind's `theme.extend` exposes those tokens as utilities so component code is `className`-driven rather than inline-style-driven.
- Three Google fonts load locally via `@fontsource/*` packages (no runtime third-party request).
- An SVG hex cartogram (`HexMap.tsx`) renders the 21 jurisdictions on the Home page; no map library, no GeoJSON. (See Decision 3 — reversed 2026-05-08.)
- Compare page implemented from scratch with a sticky picker rail, metric switcher, line overlay chart, ranked diverging-bar table, spread callout, and shareable URL state.
- County page rewired to render the prototype's six-card snapshot, long-run HPI chart with overlays, market-health breakdown, forecast cone, and federal-exposure block — degrading gracefully where fields aren't yet ingested.
- React 19 + Recharts 3 with strict TS, all `web/src` components under 150 LOC, base accessibility (semantic landmarks, `aria-pressed`/`aria-current` on toggles, focus-visible rings) restored.
- A small Vitest suite covers the format/colors libs, a `MetricCard` snapshot, and the Compare URL-state hook.

## Architecture Decisions

### 1. Token bridge — `tokens.css` + Tailwind `theme.extend` referencing `var(--*)`

**Decision:** Drop `claude_design/tokens.css` into `web/src/styles/tokens.css`, import it from `index.css`, and extend Tailwind's theme with utilities that resolve to `var(--token)`. Components use Tailwind classes; raw `var(--*)` references are reserved for cases Tailwind can't express (e.g., `linearGradient stop-color`).

**Why:** Keeps the design system as a single editable artifact (`tokens.css`), gives the component code idiomatic Tailwind, and avoids a parallel "TS theme object" that would drift. Aligns with `CLAUDE.md`'s "Tailwind CSS only — no other styling library."

**Trade-off:** Tailwind utilities resolving to CSS vars cannot be tree-shaken by class — every token ends up in the runtime stylesheet whether used or not. Acceptable because the token surface is small and the cost is one-time at first paint.

### 2. React 19 + Recharts 3 (upgrade in the same PR family as the redesign)

**Decision:** Bump `react`/`react-dom` to `^19.2`, `@types/react`/`@types/react-dom` to `^19.2`, `recharts` to `^3.8`. Keep `@tanstack/react-query ^5`, `react-router-dom ^6`. (`maplibre-gl ^4` was originally kept here; removed 2026-05-08 — see Decision 3.)

**Why:** All current peer ranges already accept React 19. The existing `web/src/` code uses none of the React 18→19 removed APIs (no `defaultProps`, no string refs, no legacy context, no `propTypes`, no `ReactDOM.render`). Recharts 3 has no prop renames against the prototype's usage; the prototype was authored against the Recharts UMD `latest` tag, which is 3.x. Doing the upgrade *now* avoids a follow-up PR and is the smallest blast radius the codebase will ever have (516 LOC).

**Trade-off:** Recharts 3 adds `react-redux`, `@reduxjs/toolkit`, `immer`, `es-toolkit`, `decimal.js-light`, and `use-sync-external-store` as transitive deps (~40–60 kB gzipped over 2.x). MapLibre is the dominant bundle contributor either way, so this is not the lever that matters for first-paint.

### 3. Home map — SVG hex cartogram (reversed from MapLibre choropleth, 2026-05-08)

**Decision:** Implement `HexMap.tsx` as a static SVG hex cartogram over a hardcoded 21-jurisdiction layout (axial coords, odd-row offset; lifted from `claude_design/map.jsx`). Driven by the same metric switcher the prototype offers (`zhviYoY`, `zhvi`, `marketHealthScore`, `daysOnMarket`, `monthsSupply`). Keep the prototype's *legend bar* and *side-panel hover detail* visual treatment.

**Why (revised):** The original task spec called for re-implementing the prototype look on MapLibre and was followed in the first build. In practice that produced a heavy WebGL component (largest single bundle import, ~200 kB+ gzipped before tiles), Falls Church / Manassas Park / Fairfax City rendered as near-invisible slivers at metro zoom, and React 19 StrictMode interactions produced a long debug tail (style-fetch race, container-size races, custom-layer races, `.maplibregl-map` CSS overriding `position: absolute` to collapse the canvas to 0×0). For 21 fixed jurisdictions on a static-data portal with no panning need, the cartogram is more legible (every jurisdiction is the same readable size), deterministic, and ~zero runtime cost.

**Why (original, kept for context):** "MapLibre is already a pinned dep. Real geography is more honest than a hand-placed hex grid for a data portal. Color expressions move into style JSON, which is more declarative and matches MapLibre's idiom." This argument loses on the trade-offs above given the dataset size and the static-only deployment constraint.

**Trade-off:** No real geography — adjacency is approximate, not cartographic. The side panel calls this out explicitly ("Reading the map. Adjacency is approximate…"). Tiny jurisdictions become first-class citizens (same hex size as Baltimore County), but users who need precise location must read the labels. No interactive zoom/pan; this is intentional for a 21-cell grid.

**Consequences (executed 2026-05-08):**
- Removed `maplibre-gl` from `web/package.json` and the lockfile.
- Deleted `web/src/components/ChoroplethMap.tsx`, `web/src/lib/map-style.ts`, `web/public/data/geo/dmv-counties.geojson`, `scripts/prep-geojson.ts`, and the `prep-geojson` npm script.
- New: `web/src/components/HexMap.tsx`. No lazy/Suspense — the SVG is small enough to ship in the main chunk.

### 4. Component primitives — port to Tailwind classes, keep prototype prop shapes

**Decision:** Port `Container`, `Card`, `MetricCard`, `JurisdictionBadge`, `SectionHeader`, `Source`, `SiteHeader`, `SiteFooter` into `web/src/components/` with prop signatures that match the prototype JSX. Replace inline `style={{}}` with Tailwind classes that resolve to tokens. Keep the existing `MetricCard` file but expand its props (`sub`, `source`, `change`, `changeLabel`, `health`) so the new County snapshot uses one component, not two.

**Why:** Prop shapes are already proven by the prototype. Class-driven styling is the project's stated rule. Consolidating the snapshot card into the same `MetricCard` avoids the dual `MetricCard`/`SnapshotCard` split the prototype shipped only for layout reasons.

**Trade-off:** Some prototype primitives (e.g., `Container`'s `1280` max width) conflict with `DESIGN_SYSTEM.md` (`1200`). We resolve to **1280** because that is what every prototype page actually renders at; the doc is wrong on that one point. We will note this in `DESIGN_SYSTEM.md` as part of the same PR.

### 5. Data layer — extend `CountySummary` only for fields that have a real ingest path; render fallbacks for the rest

**Decision:** Do not invent values. Add `population`, `medianHouseholdIncome` (already typed), and `propertyTaxRate` to the transform when an ingest source exists. Lock in two formulas in `scripts/transform/`:

- `marketHealthScore`: weighted composite of `monthsSupply` (30%), `saleToListRatio` (25%), `pctSoldAboveList` (20%), and inventory YoY (25%) — each normalised to 0–100, then weighted-summed. Buckets: 0–35 concerning, 36–55 cooling, 56–75 balanced, 76+ tight (matches the prototype).
- `affordabilityIndex`: monthly PITI (30y fixed at the national mortgage rate, 20% down, county `propertyTaxRate`, 0.35% annual insurance) on `medianSalePrice`, divided by `medianHouseholdIncome / 12`. Stored as a ratio.

Treat `forecasts[]`, `federal.series` (per-county), and `fedExposure` as **optional**. Each county-page section renders an "Insufficient data" empty state when its required field is missing, rather than blocking page render.

**Why:** Project rule: "Log a warn and skip when upstream data is missing — never invent values." The prototype's mock `genFedSeries`, hard-coded `propertyTaxRate` table, and `forecasts[]` mock would all violate this. We ship the layout but render fallbacks until ingest catches up, so design and data work can proceed in parallel.

**Trade-off:** The first deploy of the redesign will visually expose the data gaps (5 of the 6 County-page sections may render placeholders for some counties, especially 24510 / 51600). That is the honest outcome and matches the project's no-invented-values stance.

### 6. Compare URL state — `useSearchParams` round-trip

**Decision:** Persist `?counties=24031,24027,11001,51107&metric=zhvi` to the URL via `react-router-dom`'s `useSearchParams`. Initial render hydrates from the URL; toggles write back. Cap at 5 counties.

**Why:** The existing `Compare.tsx` stub-comment already calls for it, and it is the cheapest way to get shareability without a backend. Aligns with React Router 6 idioms.

**Trade-off:** URLs grow with FIPS comma-lists; acceptable at ≤5 entries (max ~30 chars).

### 7. Accessibility — fix during port, do not defer

**Decision:** While porting, add `aria-pressed` to toggle pills, `aria-current="page"` to active nav links, real `<button>` elements (not `<g onClick>`) for any clickable map feature, and `<html lang="en">`. Keep the global `:focus-visible` ring from `tokens.css`.

**Why:** Three lines of attribute changes during a port cost less than a follow-up a11y pass. The prototype already gets the broad strokes right (semantic `<main>`/`<nav>`/`<header>`/`<footer>`); only the leaves need attention.

**Trade-off:** None.

### 8. Fonts — `@fontsource/*` packages, not Google CDN

**Decision:** Replace the `@import url("…fonts.googleapis.com…")` line in `tokens.css` with three `@fontsource/source-serif-4`, `@fontsource/inter`, `@fontsource/jetbrains-mono` imports in `main.tsx`. Keep the same weight set (Inter 400/500/600/700; Source Serif 4 400/500/600/700; JetBrains Mono 400/500/600).

**Why:** No third-party runtime request; deterministic offline build; no FOUT race against `display=swap`. Cloudflare Pages serves the woff2 files alongside the bundle. Cost is ~120 kB gzipped of font data, similar to the Google CDN delivery but cached on first load.

**Trade-off:** Larger first-deploy artifact in the repo's git LFS-free output. Acceptable.

### 9. Bundle budget enforced in CI

**Decision:** Set a 500 kB gzipped budget for the largest entry chunk. Add a CI step that runs `npm run build --workspace=web` and fails if `web/dist/assets/*.js` gz-size exceeds the budget (a small `scripts/check-bundle-size.ts` is enough — no external action required).

**Why:** With React 19 + Recharts 3 + three font families, the budget is the only honest forcing function for code-splitting decisions (e.g., lazy-loading the Compare page). (Originally also justified by MapLibre; that dep was removed 2026-05-08 — see Decision 3.)

**Trade-off:** A failing CI gate can block a feature PR for an unrelated bundle regression. Mitigated by a generous initial ceiling and a `--update-snapshot`-style flag for intentional bumps.

### 10. Add a `web` CI workflow + ESLint flat config

**Decision:** Land `.github/workflows/ci.yml` (typecheck → lint → test → build → bundle-size) and `eslint.config.js` (flat config) as part of this work. Run on `push` and `pull_request` for any branch touching `web/`, `shared/`, or `scripts/`.

**Why:** ESLint 9 ships flat-config-only; without `eslint.config.js`, `npm run lint` is non-functional today. CI for a PR-driven repo is table stakes — the existing cron workflows only cover ingest. Bundle-size checks (Decision 9) need a place to run.

**Trade-off:** Pipeline maintenance cost. Acceptable; the workflow is short.

## Patterns to Follow

- **Reuse, don't rewrite:** keep `web/src/api.ts`, `web/src/lib/format.ts` (already good), and the React Query setup in `main.tsx`. The new design does not change data-fetch shape.
- **One feature per PR (per `CLAUDE.md`):** sequence is (1) CI workflow + ESLint flat config + bundle-size check, (2) tokens + Tailwind theme + fonts + Layout/SiteHeader/SiteFooter, (3) transform-side `marketHealthScore` + `affordabilityIndex` + `propertyTaxRate` + `population`, (4) Home shell + MetricStrip + BiggestMovers + WhatsDriving (without the map), (5) `HexMap` SVG cartogram (originally MapLibre choropleth + GeoJSON pipeline; reversed 2026-05-08 — see Decision 3), (6) County page rewrite, (7) Compare page from scratch with URL state, (8) `/counties` index + `/methodology` static page. Each lands on its own.
- **Reject:** the prototype's `window.X` global pattern, `Object.assign(window, …)` exports, inline `style={{}}` props, and `data.js` mock data shape. Reject the prototype's `juriBgFg` (Tailwind 200/700 swatches) — use the `DESIGN_SYSTEM.md` warm-palette pairs (DC `#FBEEF0/#6E1424`, MD `#FBF5E0/#5E4A0F`, VA `#E4EEF7/#1B4067`), since those are the documented tokens of record.
- **Reject:** the prototype's `mock` `FED_EMPLOYMENT`, `MORTGAGE_RATES`, `LISTINGS`, `propertyTaxRate` table, `forecasts` synthesis, and `summary` blurbs. Wire to real data or render an "Insufficient data" fallback.
- **Component size cap (`CLAUDE.md`):** keep every file under 150 lines; the prototype's `home.jsx` (446 LOC), `county.jsx` (623 LOC), `compare.jsx` (359 LOC), and `map.jsx` (361 LOC) must split into per-section components on port.
- **Conventional commits:** `feat:` for new pages/components, `refactor:` for the token/Tailwind bridge, `data:` only for committed JSON refreshes.

## Open Questions

None. All pre-design questions have been resolved by the user:

- Routing: add `/counties` index and `/methodology` static page (folded into Decision 4 sequencing and the Desired End State).
- Map readability: originally "accept the cartographic reality — no hex fallback, no inset"; reversed 2026-05-08 to a hex cartogram (Decision 3).
- Formulas: `marketHealthScore` and `affordabilityIndex` are locked in scripts as part of this work (Decision 5).
- Bundle budget: 500 kB gz with a CI gate (Decision 9).
- CI pipeline: add `.github/workflows/ci.yml` and `eslint.config.js` in this work (Decision 10).

## Next
**Phase:** Outline
**Artifact to review:** `docs/crispy/ui-redesign/3-design.md`
**Action:** Review decisions and open questions. Then invoke `crispy-outline` with project name `ui-redesign`.
