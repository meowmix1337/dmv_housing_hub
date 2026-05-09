# Architecture Decisions

Read this before reading `PROJECT_SPEC.md`. It explains *why* the stack is what it is, so you don't accidentally re-litigate decisions during implementation.

---

## The problem shape

We are building an informational dashboard for **public, slow-moving, identical-for-every-visitor** housing market data. The only inputs that change daily are mortgage rates and (occasionally) Redfin weekly metrics. Most data updates monthly, quarterly, or annually.

There are no users with state. There is no auth. There are no writes. Visitors arrive, look at charts, leave.

This shape rules out almost every "modern" architecture. We don't need a backend. We don't need a database. We don't need serverless functions. **The right architecture is a precomputed static site.**

---

## Decision log

### D1: Static-first, no runtime backend
**Chosen**: GitHub Actions ingests data on cron, writes JSON to `web/public/data/`, commits, Cloudflare Pages deploys.

**Rejected**:
- Go + AWS EKS (original sketch): drastic overengineering for the problem shape. Estimated $80–150/month and 100× the operational complexity for zero user-visible benefit.
- Node.js + Postgres on a VM: still requires a runtime, a database, backups, monitoring. ~$10–25/month and weekend-eating ops.
- Supabase + Cloudflare Pages: works, but the free tier pauses after 7 days of inactivity (30s cold start). Adds a SQL surface we don't need.
- Vercel + Neon: works, but Vercel's free tier is technically hobby-only and has a 100 GB/month bandwidth cap. Cloudflare doesn't.

**Why static wins here**: Sub-50ms global response times, $0/month, no cold starts, no surprise bills, the entire data history is in git, and a contributor can run the whole thing locally with `npm run dev`. The "database" is your repo's commit log.

### D2: TypeScript end-to-end
**Chosen**: TypeScript for ingest scripts, transforms, and frontend, with shared types in a `shared/` workspace package.

**Why**: The boundary between ingestion output and frontend consumption is the most common source of bugs in a dashboard like this. Sharing types across that boundary at compile time eliminates an entire class of "works locally, breaks in production after a data refresh" failures.

### D3: React + Vite
**Chosen**: React 18 + Vite. Output is a static SPA.

**Rejected**:
- Next.js: SSR/ISR are answers to questions we don't have. SSG works but adds a layer of opinion (`pages/`, `app/`, RSC) that's wasted on a static dashboard.
- SvelteKit / SolidStart: smaller bundles, but the React ecosystem (Recharts, MapLibre wrappers, React Query) is more mature.
- Plain HTML + vanilla JS: tempting, but the interactive comparison and county-detail pages are real apps. React is worth its weight here.

### D4: Recharts for charts
**Chosen**: Recharts.

**Rejected**:
- Chart.js: imperative API, awkward in React.
- D3 directly: too much code for our chart types.
- Plotly: heavy bundle, overkill.
- Visx: powerful but lower-level; build velocity matters here.
- Apache ECharts: heavy.

Recharts is declarative, TypeScript-typed, ~90 KB gzipped, and covers line/area/bar/scatter — every chart type we need.

### D5: MapLibre GL JS for maps
**Chosen**: MapLibre GL JS with free OpenStreetMap raster or vector tiles.

**Rejected**:
- Mapbox: free tier exists but credit-card-required and rate-limited.
- Leaflet: works, but raster-only and the choropleth interactions are clunkier.
- D3 geo: fine for static maps; clunky for interactive.

MapLibre is the open-source Mapbox fork — same API, no account required, free OSM tiles work out of the box.

### D6: GitHub Actions for ingestion
**Chosen**: A single monthly GitHub Actions workflow (`ingest.yml`) that runs every source, transforms, and commits.

**Rejected**:
- A Node cron daemon on a VM: requires a VM.
- Cloudflare Workers Cron Triggers: free, but 10ms CPU limit per invocation makes the larger ingests (Redfin TSVs, Census ACS bulk) impractical without complicated chunking.
- Lambda + EventBridge: works, but ties us to AWS and complicates secrets/logging.
- Per-cadence workflows (weekly/monthly/quarterly/annual, one per source): rejected after a brief experiment. Source caches under `scripts/.cache/` are gitignored, so a workflow that only ingests one source then runs the transform produces a CountySummary missing every other source's fields, churning the committed JSON. Running every source in a single workflow keeps every cache present at transform time.

GitHub Actions gives us 2,000 minutes/month free (unlimited on public repos), real shell access, easy secrets, and the same place our code lives. The workflow that fetches data is a few lines of YAML.

### D7: Commit data back to the repo
**Chosen**: The ingest workflow commits the regenerated JSON to `main`, which triggers a Cloudflare Pages redeploy.

**Why**:
- Full audit trail: every data refresh is a diffable commit.
- Reproducibility: any past version of the site can be checked out and rebuilt exactly.
- Simplicity: no separate object store, no S3 lifecycle policies, no signed URLs.
- Cache invalidation is automatic: new commit → new deploy → new edge cache.

**Trade-off**: the repo grows by tens of MB/year. At our scale (single-digit GB lifetime), this is fine. If it ever isn't, we move bulky raw archives to R2 and keep only the per-page derived JSON in git.

### D8: Build-time data joining, not client-time
**Chosen**: A `scripts/transform/build-county-pages.ts` step joins ingester outputs into per-page JSON files. The browser fetches one JSON per page view.

**Rejected**:
- Ship a single `all-data.json` blob: tens of MB on first load, awful Lighthouse score.
- Client-side join across many small files: cascading waterfalls, complex error handling.

Each county page has its own ~50–200 KB JSON with everything needed to render. One fetch, one render.

### D9: TanStack Query (React Query) for fetching
**Chosen**: `@tanstack/react-query` with stale time matching source cadence.

**Why**: It handles loading/error states, caches across navigation, deduplicates concurrent fetches, and supports optimistic updates if we ever need them. Five lines of config replaces hundreds of lines of bespoke fetch glue.

### D10: No design system
**Chosen**: Tailwind CSS + a small set of hand-built components.

**Rejected**: Material UI, Chakra, Mantine, shadcn/ui. All are fine, but they pull in opinions and bundle weight we don't need for a dashboard with a dozen components.

For v1: Tailwind utilities + a few `components/` with consistent props. If the design grows past ~30 components, revisit and consider shadcn/ui (which is copy-paste, not a runtime dependency).

### D11: Testing strategy
**Chosen**: Vitest for unit tests of ingest parsing logic and lib helpers. Manual smoke testing for the UI in v1.

**Why**: The bug surface in this app is overwhelmingly in *parsing upstream data*. CSV columns shift, a source returns null where a number is expected, dates come in three formats. That's where tests pay back. UI regressions are obvious to anyone who looks at the page.

If we ever add user-visible business logic (e.g., affordability calculator math), unit-test it. If we ever ship to production users beyond a personal portfolio, add Playwright smoke tests for the three main pages.

### D12: No analytics, no tracking, no third-party scripts
**Chosen**: Ship with zero third-party scripts.

**Why**: It's faster, more private, and avoids GDPR/CCPA cookie-banner work. If we ever need analytics, use Cloudflare's built-in (free, server-side, no JS).

---

## Things that are tempting but wrong for this app

- **"Let's add a real-time websocket for live mortgage rates."** Mortgage rates update once a week. The Freddie Mac PMMS literally publishes Thursdays at 10am ET. A static periodic refresh is correct.
- **"Let's add a database for flexibility."** What query do you want to run that you can't run at build time? If the answer is "I don't know yet," that's a v2 problem.
- **"Let's use Next.js so we can add SSR later."** YAGNI. Migration from Vite SPA to Next.js is a one-day job if and when we ever need SSR.
- **"Let's add user accounts so people can save favorite counties."** That's a real feature, but it's v3. Browser localStorage handles "remember last viewed county" for v1.
- **"Let's add an AI chatbot that answers questions about the data."** No.

## Migration paths if v1 outgrows static

These are deliberately not in v1, but the architecture supports them cleanly:

- **Need server-side aggregation** → Add a Cloudflare Worker. Free tier: 100k requests/day. Reads the same JSON files we already publish.
- **Need a real database** → Cloudflare D1 (free tier: 5 GB) or Supabase. Keep the static JSON pipeline; add D1 only for new features.
- **Need user auth** → Cloudflare Access (free for up to 50 users) or Clerk free tier.
- **Outgrew GitHub Actions free tier** → Move to a small VPS with a node cron daemon. Total migration: ~2 hours.

---

## TL;DR

> Static JSON precomputed by GitHub Actions, served from Cloudflare Pages. TypeScript everywhere. No runtime backend, no database, $0/month. Build for v1; the architecture has clear migration paths if any assumption changes.
