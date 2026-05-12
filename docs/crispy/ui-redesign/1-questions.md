# Questions

### Existing frontend baseline

1. What is the current file structure under `web/src/` (pages, components, lib, api, styles), and how big is each file by line count?
2. Which Tailwind configuration is in place today — what is in `web/tailwind.config.*`, what is in `web/src/index.css`, and are there any existing CSS custom properties or theme extensions?
3. Which dependencies are pinned in `web/package.json` and at what versions (React, React Router, TanStack Query, Recharts, MapLibre, Tailwind, Vite, TypeScript)?
4. What does each existing page component (`Home.tsx`, `County.tsx`, `Compare.tsx`) render today, and which data fetches does each issue through `web/src/api.ts`?
5. What does each existing shared component (`Layout.tsx`, `ChoroplethMap.tsx`, `MetricCard.tsx`, `PriceChart.tsx`) accept as props and emit as output?
6. Are there any existing tests under `web/` (vitest specs, snapshot tests, e2e), and what do they cover?

### Data shape and availability

7. What is the exact TypeScript shape of `CountySummary` and `MetricSeries` in `shared/types.ts`, and which fields are currently populated by the transform step versus stubbed/missing?
8. Which counties (FIPS codes) are present in `web/public/data/counties/`, and does each file contain the same set of fields, or do some have gaps?
9. What does `web/public/data/manifest.json` contain, and which freshness timestamps does it expose?
10. Which fields referenced by the prototype `data.js` and `county-data.js` are NOT present in the current `CountySummary` JSON, and which are present but under different names?

### New design system

11. What CSS custom properties are declared in `claude_design/tokens.css`, grouped by category (color, typography, spacing, radii, shadows, motion)?
12. Which Google Fonts families and weights does `tokens.css` load, and via what mechanism (`<link>`, `@import`, JS)?
13. Which color tokens are referenced inline (e.g., `#059669`, `#dc2626`) in `components.jsx`, `home.jsx`, `county.jsx`, `compare.jsx`, `map.jsx` rather than via a CSS variable?
14. What is the full list of components defined across `components.jsx`, `home.jsx`, `county.jsx`, `compare.jsx`, `map.jsx`, and which are exported via `Object.assign(window, …)` versus locally scoped?
15. Which props does each prototype primitive accept (`MetricCard`, `Card`, `JurisdictionBadge`, `SectionHeader`, `Container`, `Source`, `SiteHeader`, `SiteFooter`)?

### Page compositions

16. What are the section-level building blocks of the prototype Home page (hero, metric strip, hex map, "biggest movers" table, "what's driving the market" cards, etc.), and in what order do they appear?
17. What are the section-level building blocks of the prototype County page, including the metric grid count, chart layout, spread callout, and any sidebar?
18. What are the section-level building blocks of the prototype Compare page, including the picker rail, overlay chart, ranked diverging-bar table, and metric switcher?
19. Which Recharts component types and configuration (`CartesianGrid`, axes, tooltip styling, line/area/bar variants) are used across each prototype page?
20. How does the prototype hex map (`map.jsx`) compute hex positions and color stops, and how does its hex layout map onto the 21 DMV counties?

### Library and stack reconciliation

21. What is the current `tailwind.config.*` `theme.extend` block, and what would need to change to expose `tokens.css` variables as Tailwind utilities?
22. Does the prototype use any package not already in `web/package.json` (e.g., a specific Recharts version, a font loader, a class-merging helper), and at what version?
23. What is the current MapLibre setup in `ChoroplethMap.tsx` — style URL/spec, sources, layers, paint expressions, and interaction handlers?
24. How does the prototype's hex map differ from a MapLibre choropleth in terms of geometry source (hand-coded SVG hex grid vs. GeoJSON polygons) and color expressions?
25. Which React 19 versions are available on npm, and which `@types/react` and `@types/react-dom` versions correspond to React 19?
26. What breaking changes or removed APIs in React 19 affect the current `web/src/` code (e.g., `ReactDOM.render` removal, `defaultProps` on function components, string refs, legacy context, `propTypes` runtime checks)?
27. Which peer-dependency requirements do the currently pinned libraries (`@tanstack/react-query`, `react-router-dom`, `recharts`) declare for React, and which versions of each are needed to satisfy a React 19 peer range?
28. What are the Recharts 2.x → 3.x breaking changes (prop renames, removed components, default-value shifts on `Tooltip` / `XAxis` / `YAxis` / `CartesianGrid`, animation/legend defaults), and which of those affect the chart usages in `home.jsx`, `county.jsx`, and `compare.jsx`?

### Visual primitives and tokens in detail

29. What is the typographic scale in `tokens.css` (display, h1–h4, body, small, xs) with exact pixel sizes, line heights, and weights?
30. What spacing scale tokens exist (`--space-1` through `--space-12`) and what pixel values do they resolve to?
31. What radius and shadow tokens are defined, and where is each applied across the prototype components?
32. Which jurisdiction badge color pairs (DC / MD / VA) are defined, and are they encoded as tokens or as inline objects in `data.js`/`juriBgFg`?

### Behaviour and interaction patterns

33. Which hover, focus, and active states are specified in `DESIGN_SYSTEM.md` and which are implemented in the prototype JSX files?
34. How does the prototype handle the "wide spread" auto-trigger thresholds (`>50%` rel for value metrics, `>3 mo` supply, `>30 days` DOM), and where are those thresholds encoded?
35. What sticky/scrolling behaviour does the Compare page picker rail use, and how is it implemented in `compare.jsx`?
36. Which keyboard, focus-visible, and reduced-motion rules are present in `tokens.css` or the prototype JSX?

### Routing, navigation, and shell

37. What navigation items does the prototype `SiteHeader` declare (`Overview`, `Counties`, `Compare`, `Data & methods`), and which of those routes exist in the current `App.tsx`?
38. What does the prototype `SiteFooter` render (data sources list, disclaimer, last-refreshed line), and where do those values come from in `data.js` / `METRO`?
39. Does the prototype define any URL state for selected counties, metrics, or date ranges (query params, hash), or is all state held in component state?

### Accessibility and responsive behaviour

40. What WCAG color-contrast ratios do the foreground/background token pairs achieve (`--fg-1` on `--bg-paper`, secondary text, badge fg-on-bg, gold callout)?
41. What viewport breakpoints, if any, does `tokens.css` or the prototype JSX use, and where does the layout reflow (e.g., metric grid 5-up → 2-up)?
42. Which `aria-*` attributes, semantic landmarks, and alt text are present in the prototype components versus relying on visual cues only?

### Build, deploy, and quality gates

43. What does `npm run build` currently emit into `web/dist/`, and is the output size dominated by Recharts, MapLibre, or first-party code?
44. What checks run in CI on `web/` (typecheck, lint, test, build), and where are they configured?
45. Are there any image, font, or asset files that ship from `claude_design/` (e.g., `assets/logo-mark.svg`) that would need to move into `web/public/` or `web/src/assets/`?

## Next
**Phase:** Research
**Artifact to review:** `docs/crispy/ui-redesign/1-questions.md`
**Action:** Review and edit questions if needed. Then **start a fresh session** and invoke `crispy-research` with project name `ui-redesign`.
⚠️ A fresh session is required so research is objective and unbiased by task knowledge.
