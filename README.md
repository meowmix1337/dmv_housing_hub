# DMV Housing Market App

Interactive informational dashboard for the Washington, D.C. / Maryland / Virginia housing market, with county-level breakdowns. Built as a static site, ingested from free public APIs, deployed to Cloudflare Pages for $0/month.

> **For Claude Code / contributors**: read these documents in order before writing code:
> 1. `ARCHITECTURE.md` — why the stack is what it is
> 2. `PROJECT_SPEC.md` — what to build, in order
> 3. `DATA_SOURCES.md` — how each ingester works
> 4. `CLAUDE.md` — coding rules and constraints

## Quick start (local dev)

```bash
# Prereqs: Node 20, npm 10
nvm use                 # picks up .nvmrc
npm install             # installs all workspaces

# Set up API keys (see "Get API keys" below)
cp .env.example .env
# edit .env

# Run the FRED ingester end-to-end
npm run ingest:fred --workspace=scripts

# Build per-county JSON
npm run transform --workspace=scripts

# Start the frontend
npm run dev --workspace=web
# → http://localhost:5173
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

GitHub Actions runs ingest scripts on cron. Each script fetches from a free public API (FRED, Census, BLS, Zillow, Redfin), normalizes to `Observation[]`, and writes JSON to `web/public/data/`. A transform step joins observations into per-county JSON files. The workflow commits the changes; Cloudflare Pages auto-deploys. The frontend is a static React SPA that fetches `/data/counties/{fips}.json` and renders charts. No runtime backend, no database, no servers.

## Repository layout

```
.
├── .github/workflows/        # GitHub Actions cron jobs
├── scripts/                  # Ingest + transform (TypeScript)
├── shared/                   # Types shared across scripts and web
├── web/                      # React + Vite frontend
└── docs/                     # ARCHITECTURE, PROJECT_SPEC, DATA_SOURCES, CLAUDE
```

## Data refresh schedule

A single workflow (`.github/workflows/ingest.yml`) runs monthly (5th at 14:00 UTC), ingests every source, transforms, and commits. Upstream cadences vary — see `DATA_SOURCES.md`.

| Source | Upstream cadence |
|---|---|
| Freddie Mac mortgage rates | Weekly (Thu) |
| Redfin market metrics | Weekly (Wed) |
| Zillow ZHVI / ZORI | Monthly |
| Realtor.com hotness (via FRED) | Monthly |
| BLS unemployment | Monthly |
| FHFA state HPI | Quarterly |
| FHFA county HPI | Annual |
| Census ACS | Annual |

## Deployment

1. Push to GitHub (public repo for unlimited Actions minutes)
2. Cloudflare dashboard → Pages → Connect to Git → select repo
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build --workspace=web`
   - Build output: `web/dist`
4. Optional: custom domain (free TLS auto-provisioned)

Every push to `main` deploys in ~60 seconds.

## License

MIT. Data is sourced from public agencies; cite them per `DATA_SOURCES.md`.
