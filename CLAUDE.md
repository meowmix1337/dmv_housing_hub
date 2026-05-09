# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reference docs (read when relevant)

- `ARCHITECTURE.md` — rationale behind every stack decision; re-read before introducing new dependencies
- `PROJECT_SPEC.md` — implementation order and definition of done for v1
- `DATA_SOURCES.md` — ingester contracts; update in the same PR if upstream behavior changes

## Commands

```bash
# Development
npm run dev                          # start Vite dev server (web only)
npm run build                        # build shared + web (Cloudflare Pages output in web/dist/)

# Quality checks — run both before claiming work is done
npm run typecheck                    # tsc --noEmit across all workspaces
npm run lint                         # eslint .

# Tests
npm run test                         # vitest run across all workspaces
npm run test --workspace=scripts     # scripts workspace only
npx vitest run scripts/lib/counties.test.ts   # single test file

# Data pipeline
npm run ingest --workspace=scripts   # all ingesters (requires API keys in env)
npm run ingest:fred --workspace=scripts      # single ingester
npm run transform --workspace=scripts        # join raw cache → per-county JSON

# Local ingest requires env vars
FRED_API_KEY=xxx npm run ingest:fred --workspace=scripts
```

Required environment variables for ingestion (stored as GitHub Actions secrets for CI):
- `FRED_API_KEY` — free at https://fred.stlouisfed.org/docs/api/api_key.html
- `CENSUS_API_KEY` — free at https://api.census.gov/data/key_signup.html
- `BLS_API_KEY` — free at https://data.bls.gov/registrationEngine/

## Architecture

**Fundamental constraint**: no runtime backend, no database. Data is precomputed at build time by GitHub Actions and committed as JSON. The browser fetches one JSON file per page view.

### Workspace layout

```
shared/     canonical TypeScript types — imported by both scripts and web
scripts/    Node.js ingest + transform pipeline (runs in GitHub Actions, not the browser)
web/        React + Vite SPA (static output, deployed to Cloudflare Pages)
```

### Data flow

```
GitHub Actions cron
  → scripts/ingest/run.ts --source=<name>
  → scripts/.cache/{source}.json          ← raw Observation[] dump (gitignored)
  → scripts/transform/build-county-pages.ts
  → web/public/data/counties/{fips}.json  ← CountySummary (committed to repo)
  → web/public/data/metrics/*.json        ← MetricSeries (national/metro)
  → web/public/data/manifest.json         ← freshness timestamps
  → Cloudflare Pages redeploy (triggered by the commit)
```

### Type boundary (`shared/types.ts`)

`Observation` is the atomic output of every ingester:
```ts
{ source, series, fips, metric: MetricId, observedAt, value, unit }
```

`CountySummary` is what the County page consumes — one JSON file per county under `web/public/data/counties/{fips}.json`. The transform step joins multiple source caches into this shape.

Never break `shared/types.ts` without updating both the scripts and the web consumer.

### Ingester pattern

Every ingester implements `DataSource` (`scripts/ingest/DataSource.ts`):
```ts
interface DataSource {
  readonly name: string;
  readonly cadence: Cadence;
  fetch(): Promise<Observation[]>;
}
```

`scripts/ingest/fred.ts` is the reference implementation. Study it before writing a new ingester.

### Frontend routes

```
/                    Home.tsx     — DMV choropleth (MapLibre), colored by FHFA HPI YoY
/county/:fips        County.tsx   — single county detail, PriceChart, MetricCard
/compare             Compare.tsx  — multi-county overlay chart (up to 5)
```

Data fetching goes through `web/src/api.ts` (typed wrappers), consumed via React Query. One fetch per page — no cascading requests.

### Source-specific gotchas

- **FRED**: missing values arrive as `"."` (string), not null; `value` is always a string — parse to number
- **Zillow**: wide format (one column per month) — transpose to long form; no FIPS in file, resolve via county name lookup
- **BLS**: period codes `M01`–`M12`; filter out `M13` (annual average); up to 50 series per POST
- **Redfin**: large TSV (~7M rows national) — filter by `state_code IN ('DC','MD','VA')` immediately on parse

## Architectural constraints (do not violate)

- **No runtime backend** — no Express, Next.js API routes, Cloudflare Workers, Lambda, or anything that runs server-side per request
- **No database** — Postgres, Supabase, D1, SQLite-as-runtime — none of it
- **No paid services** — nothing requiring a credit card; free tiers are fine if they don't pause/throttle
- **No Docker, no Kubernetes**
- **No auth, no user state** — v1 is anonymous read-only

If a request requires breaking one of these: "This requires X, which is excluded by `ARCHITECTURE.md` D1. Do you want to revisit that decision?"

## Coding rules

### TypeScript
- Strict mode, no `any`, no non-null assertions in production paths
- Explicit return types on all exported functions
- `interface` for object shapes; `type` for unions/aliases
- Discriminated unions for variant types

### Libraries
- All HTTP: `scripts/lib/http.ts` (`fetchWithRetry` — retries, backoff, Retry-After)
- All file writes: `scripts/lib/storage.ts` (atomic temp-then-rename)
- Logging: `scripts/lib/log.ts` (Pino, structured); no `console.log` in production paths
- Errors: throw typed `IngestError` with `source`, `series`, `cause` fields; include status + body excerpt for HTTP errors

### Data integrity
- Validate upstream data shapes with Zod or hand-rolled checks
- Every `Observation` retains `source` and `series` for citation — never strip them in transforms
- All JSON output includes a `lastUpdated` timestamp
- Log `warn` and skip when upstream data is missing — never invent values

### Frontend
- Tailwind CSS only — no other styling library
- React Query for data fetching; Recharts for charts; MapLibre GL JS for maps
- Components stay under 150 lines; split when they grow

### Git
- Conventional commits: `feat:`, `fix:`, `data:`, `chore:`, `docs:`, `refactor:`, `test:`
- One ingester per PR; one feature per PR
- Auto-generated data refresh commits use `data:` prefix
- Feature branches only — never commit to `main`
- Verify branch with `git branch --show-current` before any work
- PR base is always `main`
- Keep commits small: 2–3 files, ~200–300 lines of changes per commit

## When in doubt

- Read the three docs again
- If the user request conflicts with a doc, surface the conflict — don't silently violate the docs
- If a free tier limit is approaching, surface it with numbers — don't silently route around it
- If a piece of upstream data is missing, log a warn and skip — don't make up values