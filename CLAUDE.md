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
npm run test                         # vitest run across all workspaces (shared + web)
make test                            # go test ./... + npm test (one command for both pipelines)
cd go && go test ./...               # Go tests only

# Data pipeline (Go 1.26)
make ingest                          # all ingesters (requires API keys in repo-root .env)
make transform                       # join raw cache → per-county JSON
cd go && go run ./cmd/ingest-fred    # single ingester
cd go && OUT_DATA_DIR=/tmp/foo go run ./cmd/transform   # write elsewhere
```

`.env` at repo root is auto-loaded by every `go run ./cmd/*` (via
`godotenv.Load("../.env", ".env")`); no manual export needed.

Required environment variables for ingestion (stored as GitHub Actions environment secrets in the `production` environment for CI):
- `FRED_API_KEY` — free at https://fred.stlouisfed.org/docs/api/api_key.html
- `CENSUS_API_KEY` — free at https://api.census.gov/data/key_signup.html
- `BLS_API_KEY` — free at https://data.bls.gov/registrationEngine/

## Architecture

**Fundamental constraint**: no runtime backend, no database. Data is precomputed at build time by GitHub Actions and committed as JSON. The browser fetches one JSON file per page view.

### Workspace layout

```
shared/     canonical TypeScript types — imported by web; hand-mirrored in go/internal/types
go/         Go 1.26 ingest + transform pipeline (runs in GitHub Actions, not the browser)
web/        React + Vite SPA (static output, deployed to Cloudflare Pages)
```

### Data flow

```
GitHub Actions cron (.github/workflows/ingest.yml — single monthly run)
  → go/cmd/ingest-all
  → go/.cache/{source}.json               ← raw IngestResult dump (gitignored)
  → go/cmd/transform
  → web/public/data/counties/{fips}.json  ← CountySummary (committed to repo)
  → web/public/data/metrics/*.json        ← MetricSeries (national/metro/DMV)
  → web/public/data/manifest.json         ← freshness + lastVerified per source
  → Cloudflare Pages redeploy (triggered by the commit)
```

### Type boundary (`shared/types.ts`)

`Observation` is the atomic output of every ingester (shape declared in `shared/src/types.ts`, hand-mirrored in `go/internal/types/types.go`):
```ts
{ source, series, fips, metric: MetricId, observedAt, value, unit }
```

`CountySummary` is what the County page consumes — one JSON file per county under `web/public/data/counties/{fips}.json`. The transform step joins multiple source caches into this shape.

Never break `shared/src/types.ts` without updating both `go/internal/types/types.go` (and its contract test) and the web consumer.

### Ingester pattern

Every ingester implements `DataSource` (`go/internal/ingest/datasource.go`):
```go
type DataSource interface {
    Name() string
    Cadence() types.Cadence
    Fetch(ctx context.Context) ([]types.Observation, error)
}
```

`go/internal/ingest/fred/fred.go` is the reference implementation. See `go/README.md` for the full "adding a new ingester" checklist.

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

### Libraries (Go pipeline)
- All HTTP: `go/internal/http/client.go` (retry-go-backed, honors Retry-After numeric + HTTP date)
- All file writes: `go/internal/storage/atomic.go` (atomic temp-then-rename via `os.Rename`)
- Logging: `go/internal/log/log.go` (`log/slog` with TTY-aware handler); no `fmt.Println` in production paths
- Errors: wrap HTTP failures as `*httpclient.HTTPError{Status, URL, BodyExcerpt}`; non-retryable 4xx (except 408/429) fail fast

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