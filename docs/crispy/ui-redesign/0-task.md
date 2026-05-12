# Task

UI/UX redesign. Look at `claude_design/` — this is the new UI/UX that we need to implement.

## Source materials

The new design lives at the repository root in `claude_design/` and contains:

- `DESIGN_SYSTEM.md` — written design system reference (color, typography, spacing, components, what is deliberately excluded)
- `tokens.css` — CSS variables that are the source of truth (colors, fonts, spacing, radii, shadows)
- `components.jsx` — shared UI primitives: `BrandMark`, `SiteHeader`, `SiteFooter`, `JurisdictionBadge`, `Card`, `MetricCard`, `SectionHeader`, `Container`, `Source`
- `home.jsx`, `county.jsx`, `compare.jsx` — page compositions for the three primary routes
- `map.jsx` — hex map prototype for the Home page choropleth
- `data.js`, `county-data.js` — prototype data shape (mirrors canonical `CountySummary` from `02-DATA_MODEL.md`)
- `Home.html`, `County.html`, `Compare.html` — runnable previews (UMD React + Recharts + Babel-standalone)
- `uploads/01-DESIGN_BRIEF.md`, `uploads/02-DATA_MODEL.md`, `uploads/03-COUNTIES.md`, `uploads/04-DMV_CONTEXT.md` — design brief and data context
- `assets/logo-mark.svg` — single brand mark

## Target

Implement the new design in the existing web app (`web/`):

- React 19 + Vite SPA
- Tailwind CSS, React Router, TanStack Query, Recharts, MapLibre GL JS
- Existing routes: `/` (Home), `/county/:fips` (County), `/compare` (Compare)
- Existing components: `Layout`, `ChoroplethMap`, `MetricCard`, `PriceChart`
- Static output deployed to Cloudflare Pages — no runtime backend, no database
- Data already shipped in `web/public/data/` as JSON (per `CountySummary` shape)

## Constraints carried over from `CLAUDE.md` / `ARCHITECTURE.md`

- No runtime backend; no DB; no paid services; no Docker; no auth
- Tailwind only for styling (the new design uses raw CSS variables in `tokens.css`, so the bridge into Tailwind theme extension is part of the work)
- Recharts for charts; MapLibre GL JS for maps (the prototype hex map in `map.jsx` is hand-rolled SVG, not MapLibre — re-implementing the look on MapLibre is part of the work)
- Components stay under 150 lines; split when they grow
- Conventional commits; one feature per PR
