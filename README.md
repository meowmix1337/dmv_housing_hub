# DMV Housing Market App

Interactive informational dashboard for the Washington, D.C. / Maryland / Virginia housing market, with county-level breakdowns. Built as a static site, ingested from free public APIs, deployed to Cloudflare Pages for $0/month.

> **For Claude Code / contributors**: read these documents in order before writing code:
> 1. `ARCHITECTURE.md` — why the stack is what it is
> 2. `PROJECT_SPEC.md` — what to build, in order
> 3. `DATA_SOURCES.md` — how each ingester works
> 4. `CLAUDE.md` — coding rules and constraints
> 5. `CONTRIBUTING.md` — step-by-step build playbook
> 6. `DESIGN_SYSTEM.md` — color, type, and component tokens for the frontend

## Quick start (local dev)

```bash
# Prereqs: Node 24 (pinned via .nvmrc / package.json engines), npm 10+
nvm use                 # picks up .nvmrc
npm install             # installs all workspaces

# Set up API keys (see "Get API keys" below)
cp .env.example .env
# edit .env

# Run a single ingester end-to-end (others: census, bls, zillow, redfin, qcew)
npm run ingest:fred --workspace=scripts

# Or ingest every source at once
npm run ingest --workspace=scripts -- --all

# Build per-county JSON from the cached observations
npm run transform --workspace=scripts

# Start the frontend
npm run dev
# → http://localhost:5173
```

Quality checks (run both before opening a PR):

```bash
npm run typecheck       # tsc --noEmit across all workspaces
npm run lint            # eslint .
npm run test            # vitest across all workspaces
```

## Get API keys (all free, ~5 minutes total)

1. **FRED** — https://fred.stlouisfed.org/docs/api/api_key.html (instant email)
2. **Census** — https://api.census.gov/data/key_signup.html (instant email)
3. **BLS** — https://data.bls.gov/registrationEngine/ (instant email)

Add to `.env`:

```
FRED_API_KEY=...
CENSUS_API_KEY=...
BLS_API_KEY=...
```

For deployment, add the same three as **environment secrets** to a GitHub environment named `production` (Settings → Environments → New environment). The `ingest.yml` workflow declares `environment: production`, so it can read them at run time.

## Architecture in one paragraph

GitHub Actions runs ingest scripts on cron. Each script fetches from a free public API (FRED, Census, BLS LAUS, BLS QCEW, Zillow, Redfin), normalizes to `Observation[]`, and writes JSON to `web/public/data/`. A transform step joins observations into per-county JSON files plus a few DMV-wide metric series. The workflow commits the changes; Cloudflare Pages auto-deploys. The frontend is a static React SPA that fetches `/data/counties/{fips}.json` (or a metric file) and renders charts. No runtime backend, no database, no servers.

### Frontend routes

| Path | Page | Purpose |
|---|---|---|
| `/` | `Home.tsx` | DMV choropleth + headline cards |
| `/counties` | `Counties.tsx` | Sortable county table |
| `/county/:fips` | `County.tsx` | Single-county detail with charts |
| `/compare` | `Compare.tsx` | Overlay up to 5 counties |
| `/methodology` | `Methodology.tsx` | Source list, citations, known gaps |

## Repository layout

```
.
├── .github/workflows/        # GitHub Actions: ingest cron + CI
├── scripts/                  # Ingest + transform (TypeScript, runs in CI)
├── shared/                   # Types shared across scripts and web
├── web/                      # React + Vite frontend (Cloudflare Pages output)
├── web/public/data/          # Committed JSON: counties/, metrics/, manifest.json
├── docs/                     # Verification logs, CRISPY workflow artifacts
├── ARCHITECTURE.md           # Stack rationale
├── PROJECT_SPEC.md           # Build order + definition of done
├── DATA_SOURCES.md           # Per-source ingester contracts
├── CONTRIBUTING.md           # Step-by-step build playbook
├── DESIGN_SYSTEM.md          # Color, type, component tokens
└── CLAUDE.md                 # Coding rules for AI contributors
```

## Data refresh schedule

A single workflow (`.github/workflows/ingest.yml`) runs monthly (5th at 14:00 UTC), ingests every source, transforms, and commits. Upstream cadences vary — see `DATA_SOURCES.md`.

| Source | Upstream cadence |
|---|---|
| Freddie Mac mortgage rates (via FRED) | Weekly (Thu) |
| Redfin market metrics | Weekly (Wed) |
| Zillow ZHVI / ZORI | Monthly |
| Realtor.com hotness (via FRED) | Monthly |
| BLS LAUS unemployment | Monthly |
| BLS QCEW wages / employment | Quarterly |
| FHFA state HPI | Quarterly |
| FHFA county HPI | Annual |
| Census ACS | Annual |

Per-source freshness (including a `lastVerified` stamp) is published at `web/public/data/manifest.json` and surfaced on the Methodology page.

## Deployment

1. Push to GitHub (public repo for unlimited Actions minutes)
2. Cloudflare dashboard → Pages → Connect to Git → select repo
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build` (builds the `shared` workspace then `web`)
   - Build output: `web/dist`
4. Optional: custom domain (free TLS auto-provisioned)

Every push to `main` deploys in ~60 seconds.

## Roadmap / TODO

- **County price forecasts** — the County page previously showed a "2026 price forecast" placeholder card. Removed in 2026-05 because no forecast data source is wired up yet. Revisit when a free, redistributable forecast feed (e.g., Bright MLS, NAR, or Zillow ZHVF) is ingested. Hooks already exist on the type side (`CountyForecast` in `shared/src/types.ts`, `CountySummary.forecasts?`), and `Methodology.tsx` still references the gap.

## License

MIT. Data is sourced from public agencies; cite them per `DATA_SOURCES.md`.
