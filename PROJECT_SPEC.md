# DMV Housing Market App — Implementation Spec

This document is the canonical implementation guide for an interactive informational web app showing housing market data for the Washington, D.C. / Maryland / Virginia (DMV) metro area, with county-level breakdowns.

**Read `ARCHITECTURE.md` first** for the architectural rationale. This document is the build plan.

---

## Goal

Build a static, single-page web app that:

1. Shows current housing market conditions, historical trends, affordability, market health, and forecasts for every DMV county.
2. Supports interactive comparisons across counties.
3. Refreshes automatically via GitHub Actions cron jobs.
4. Costs **$0/month** to operate.
5. Is built end-to-end in TypeScript and is straightforward for one developer to extend.

## Non-goals (do not build these in v1)

- User accounts, auth, saved searches, alerts
- Property-level listings or address search (no MLS license)
- Ad-hoc SQL or runtime database
- Mobile native apps
- AI/LLM features

---

## Stack (locked)

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict mode) end-to-end | Shared types between ingest scripts and frontend |
| Frontend framework | React 18 + Vite | Fast dev, static output, mainstream |
| Charts | Recharts | TypeScript-friendly, declarative, sufficient for line/bar/area/scatter |
| Maps | MapLibre GL JS + free OSM tiles | Free, open-source Mapbox fork |
| Styling | Tailwind CSS | Fast iteration, no design-system overhead |
| State | React Query (TanStack Query) | Caches `/data/*.json` fetches, handles loading/error |
| Data shape | Static JSON files in `web/public/data/` | The URL is the API |
| Hosting | Cloudflare Pages | Unlimited bandwidth, free TLS, GitHub auto-deploy |
| Ingestion | GitHub Actions cron + Node.js scripts | Free for public repos |
| Bulk archive | (optional, later) Cloudflare R2 | 10 GB free, zero egress |
| Package manager | npm with workspaces | Stdlib, no extra tooling |
| Node version | 20 LTS | Required by Vite 5+ |

**Do not introduce**: a runtime backend, a database, Docker, Kubernetes, AWS, serverless functions, paid APIs, or auth. If you find yourself wanting one, stop and re-read `ARCHITECTURE.md`.

---

## Repo layout (build exactly this structure)

```
dmv-housing-app/
├── .github/workflows/
│   └── ingest.yml                  # single monthly ingest + transform + commit
├── scripts/
│   ├── package.json
│   ├── tsconfig.json
│   ├── ingest/
│   │   ├── DataSource.ts              # shared interface
│   │   ├── fred.ts                    # FRED API ingester (first one to build)
│   │   ├── freddie-mac.ts             # mortgage rates (no key)
│   │   ├── census.ts                  # ACS demographics
│   │   ├── bls.ts                     # county unemployment
│   │   ├── zillow.ts                  # ZHVI, ZORI CSVs
│   │   ├── redfin.ts                  # weekly TSV
│   │   └── run.ts                     # CLI runner
│   ├── transform/
│   │   ├── compute-affordability.ts
│   │   ├── compute-market-health.ts
│   │   └── build-county-pages.ts      # join all sources → per-county JSON
│   └── lib/
│       ├── counties.ts                # DMV FIPS registry (provided below)
│       ├── http.ts                    # fetch with retry/backoff
│       ├── storage.ts                 # write JSON safely
│       └── log.ts                     # structured logging
├── shared/
│   ├── package.json
│   └── types.ts                       # canonical types (provided below)
├── web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   ├── public/
│   │   ├── _headers                   # Cloudflare Pages cache headers
│   │   └── data/
│   │       ├── manifest.json          # last-updated timestamps
│   │       ├── counties/
│   │       │   ├── 11001.json         # DC
│   │       │   ├── 24031.json         # Montgomery County, MD
│   │       │   └── ...                # one per DMV county
│   │       ├── metrics/
│   │       │   ├── mortgage-rates.json
│   │       │   └── ...
│   │       └── geo/
│   │           └── dmv-counties.geojson  # for choropleth
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css                  # tailwind directives
│       ├── api.ts                     # typed fetch wrapper
│       ├── pages/
│       │   ├── Home.tsx
│       │   ├── County.tsx
│       │   └── Compare.tsx
│       ├── components/
│       │   ├── PriceChart.tsx
│       │   ├── MarketHealthGauge.tsx
│       │   ├── ChoroplethMap.tsx
│       │   ├── AffordabilityCalculator.tsx
│       │   ├── ForecastFan.tsx
│       │   ├── MetricCard.tsx
│       │   └── Layout.tsx
│       └── lib/
│           ├── format.ts              # number/currency/date formatters
│           └── colors.ts              # consistent county colors
├── .env.example
├── .gitignore
├── .nvmrc                             # "20"
├── .editorconfig
├── .prettierrc
├── eslint.config.js
├── package.json                       # root, defines workspaces
├── tsconfig.base.json
├── README.md
└── LICENSE                            # MIT
```

---

## Implementation order (do these in sequence)

Each step is independently verifiable. Don't proceed to the next until the previous is working.

### Step 1: Repo scaffold
- Initialize npm workspaces (`web`, `scripts`, `shared`)
- Configure root `tsconfig.base.json` with strict mode, target ES2022, module NodeNext for scripts and ESNext for web
- Add ESLint (typescript-eslint), Prettier, EditorConfig
- Add `.gitignore` (node_modules, dist, .env, web/public/data/raw/)
- Verify: `npm install` from root succeeds

### Step 2: Shared types
- Implement `shared/types.ts` per the spec below
- Verify: `tsc --noEmit` passes from `shared/`

### Step 3: Counties registry
- Implement `scripts/lib/counties.ts` with the full DMV FIPS list (provided below)
- Verify: import and log it; counts match (one DC, ten MD jurisdictions, ten VA jurisdictions = 21 total)

### Step 4: FRED ingester (the reference implementation)
- Implement `scripts/lib/http.ts` (fetch with retry, exponential backoff, respect `Retry-After`)
- Implement `scripts/lib/storage.ts` (write JSON atomically: temp file + rename)
- Implement `scripts/ingest/DataSource.ts` interface
- Implement `scripts/ingest/fred.ts`:
  - For each DMV county, fetch FHFA all-transactions HPI (series ID `ATNHPIUS{FIPS}A`)
  - For each DMV county, fetch Realtor.com hotness score (series ID `HOSCCOUNTY{FIPS}`)
  - State-level FHFA: `DCSTHPI`, `MDSTHPI`, `VASTHPI`
  - National 30-yr mortgage rate: `MORTGAGE30US`
  - Output to `scripts/.cache/fred.json` (raw) and emit `Observation[]`
- Implement `scripts/ingest/run.ts` CLI:
  - `npx tsx run.ts --source=fred` runs the FRED ingester
  - On success, writes raw output to cache and pretty-prints summary
- Verify: `FRED_API_KEY=xxx npx tsx scripts/ingest/run.ts --source=fred` produces a non-empty JSON with observations for every DMV county

### Step 5: Build a single county page JSON
- Implement `scripts/transform/build-county-pages.ts`:
  - Read raw FRED output
  - For Montgomery County (FIPS 24031), produce `web/public/data/counties/24031.json` matching the `CountySummary` type
  - Include: county metadata, latest values, full historical FHFA HPI series, last_updated timestamp
- Verify: open the JSON, confirm structure, view in a browser at `web/public/data/counties/24031.json`

### Step 6: Frontend scaffold
- Set up Vite + React + TypeScript + Tailwind
- Implement `web/src/api.ts` typed fetch wrapper
- Implement `Layout.tsx`, `Home.tsx` (placeholder), `County.tsx`
- React Router: `/` → Home, `/county/:fips` → County
- Verify: `npm run dev --workspace=web` shows blank pages without errors

### Step 7: First chart
- Implement `PriceChart.tsx` using Recharts
- On `/county/24031`, render the FHFA HPI time series for Montgomery County
- Verify: chart renders, hover shows tooltip with date and value

### Step 8: Choropleth map
- Add `web/public/data/geo/dmv-counties.geojson` (instructions to source it below)
- Implement `ChoroplethMap.tsx` using MapLibre GL JS
- On `/`, color counties by latest FHFA HPI YoY change
- Verify: clicking a county navigates to `/county/:fips`

### Step 9: Add remaining ingesters
- `freddie-mac.ts` — Freddie Mac PMMS weekly mortgage rates (CSV, no key)
- `census.ts` — ACS 5-year tables B19013, B25077, B25064 for every DMV county
- `bls.ts` — county unemployment rate (LAUS), federal employment for the metro
- `zillow.ts` — ZHVI all-homes mid-tier monthly CSV, ZORI smoothed monthly CSV
- `redfin.ts` — weekly county-level TSV (filter to `state_code IN ('DC','MD','VA')`)
- Register the source in `scripts/ingest/run.ts` `REGISTRY` — `ingest.yml` runs `--all`, so new sources are picked up automatically

### Step 10: Derived metrics
- `compute-affordability.ts`: P&I + tax + insurance for median home at current 30-yr rate, ÷ median household income
- `compute-market-health.ts`: weighted blend (months of supply 30%, sale-to-list 30%, % price drops 20%, inventory YoY 20%) → 0–100 score

### Step 11: Remaining UI
- `Compare.tsx`: multi-select up to 5 counties, overlay chart
- `MarketHealthGauge.tsx`: thermometer-style 0–100 gauge
- `AffordabilityCalculator.tsx`: interactive sliders for income, down payment, rate
- `ForecastFan.tsx`: cone-of-uncertainty for 2026 forecasts (Bright MLS, Zillow, NAR)

### Step 12: GitHub Actions wiring
- Implement `ingest.yml` (single monthly workflow that runs every source, transforms, and commits)
- Set environment secrets in the `production` environment: `FRED_API_KEY`, `CENSUS_API_KEY`, `BLS_API_KEY`
- Run `workflow_dispatch` manually to verify it commits valid JSON

### Step 13: Cloudflare Pages deploy
- Connect repo to Cloudflare Pages
- Build settings: Vite preset, `npm run build --workspace=web`, output `web/dist`
- Verify: production URL serves the app, `/data/counties/24031.json` is reachable

---

## DMV FIPS registry (use exactly these — `scripts/lib/counties.ts`)

```ts
export type Jurisdiction = "DC" | "MD" | "VA";

export interface County {
  fips: string;          // 5-digit FIPS
  name: string;          // e.g. "Montgomery County"
  shortName: string;     // e.g. "Montgomery"
  jurisdiction: Jurisdiction;
  isIndependentCity?: boolean;
  population2023?: number; // for choropleth weighting
}

export const DMV_COUNTIES: County[] = [
  // District of Columbia
  { fips: "11001", name: "District of Columbia", shortName: "DC", jurisdiction: "DC" },

  // Maryland
  { fips: "24003", name: "Anne Arundel County",     shortName: "Anne Arundel",     jurisdiction: "MD" },
  { fips: "24005", name: "Baltimore County",        shortName: "Baltimore Co.",    jurisdiction: "MD" },
  { fips: "24009", name: "Calvert County",          shortName: "Calvert",          jurisdiction: "MD" },
  { fips: "24017", name: "Charles County",          shortName: "Charles",          jurisdiction: "MD" },
  { fips: "24021", name: "Frederick County",        shortName: "Frederick",        jurisdiction: "MD" },
  { fips: "24027", name: "Howard County",           shortName: "Howard",           jurisdiction: "MD" },
  { fips: "24031", name: "Montgomery County",       shortName: "Montgomery",       jurisdiction: "MD" },
  { fips: "24033", name: "Prince George's County",  shortName: "Prince George's",  jurisdiction: "MD" },
  { fips: "24510", name: "Baltimore city",          shortName: "Baltimore City",   jurisdiction: "MD", isIndependentCity: true },

  // Virginia
  { fips: "51013", name: "Arlington County",        shortName: "Arlington",        jurisdiction: "VA" },
  { fips: "51059", name: "Fairfax County",          shortName: "Fairfax",          jurisdiction: "VA" },
  { fips: "51107", name: "Loudoun County",          shortName: "Loudoun",          jurisdiction: "VA" },
  { fips: "51153", name: "Prince William County",   shortName: "Prince William",   jurisdiction: "VA" },
  { fips: "51177", name: "Spotsylvania County",     shortName: "Spotsylvania",     jurisdiction: "VA" },
  { fips: "51179", name: "Stafford County",         shortName: "Stafford",         jurisdiction: "VA" },
  { fips: "51510", name: "Alexandria city",         shortName: "Alexandria",       jurisdiction: "VA", isIndependentCity: true },
  { fips: "51600", name: "Fairfax city",            shortName: "Fairfax City",     jurisdiction: "VA", isIndependentCity: true },
  { fips: "51610", name: "Falls Church city",       shortName: "Falls Church",     jurisdiction: "VA", isIndependentCity: true },
  { fips: "51683", name: "Manassas city",           shortName: "Manassas",         jurisdiction: "VA", isIndependentCity: true },
  { fips: "51685", name: "Manassas Park city",      shortName: "Manassas Park",    jurisdiction: "VA", isIndependentCity: true },
];

export const FIPS_BY_ID = new Map(DMV_COUNTIES.map(c => [c.fips, c]));
```

---

## Canonical types (`shared/types.ts`)

```ts
export type Cadence = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
export type Jurisdiction = "DC" | "MD" | "VA";

export interface Observation {
  source: string;          // "fred" | "redfin" | "zillow" | ...
  series: string;          // upstream series ID
  fips: string;            // 5-digit county FIPS, "USA" for national
  metric: MetricId;        // canonical metric name
  observedAt: string;      // ISO date string
  value: number;
  unit: string;            // "USD" | "percent" | "index_2000=100" | "days"
}

export type MetricId =
  | "fhfa_hpi"
  | "median_sale_price"
  | "median_list_price"
  | "median_price_per_sqft"
  | "zhvi_all_homes"
  | "zhvi_sfh"
  | "zhvi_condo"
  | "zori_rent"
  | "active_listings"
  | "new_listings"
  | "homes_sold"
  | "months_supply"
  | "days_on_market"
  | "sale_to_list_ratio"
  | "pct_sold_above_list"
  | "pct_price_drops"
  | "mortgage_30y_rate"
  | "median_household_income"
  | "median_home_value"
  | "median_gross_rent"
  | "unemployment_rate"
  | "federal_employment"
  | "building_permits"
  | "hotness_score"
  | "hotness_rank";

export interface MetricPoint {
  date: string;            // ISO date
  value: number;
}

export interface MetricSeries {
  metric: MetricId;
  fips: string;
  unit: string;
  cadence: Cadence;
  source: string;
  lastUpdated: string;     // ISO timestamp
  points: MetricPoint[];
}

export interface CountySummary {
  fips: string;
  name: string;
  jurisdiction: Jurisdiction;
  population?: number;
  medianHouseholdIncome?: number;
  lastUpdated: string;     // ISO timestamp
  current: {
    medianSalePrice?: number;
    medianSalePriceYoY?: number;
    zhvi?: number;
    zhviYoY?: number;
    daysOnMarket?: number;
    monthsSupply?: number;
    saleToListRatio?: number;
    pctSoldAboveList?: number;
    unemploymentRate?: number;
    marketHealthScore?: number;     // 0-100
    affordabilityIndex?: number;    // monthly cost / monthly income, 0-1
  };
  series: {
    fhfaHpi?: MetricPoint[];
    zhvi?: MetricPoint[];
    medianSalePrice?: MetricPoint[];
    daysOnMarket?: MetricPoint[];
    activeListings?: MetricPoint[];
  };
  forecasts?: {
    source: string;        // "Bright MLS" | "Zillow" | "NAR"
    metric: MetricId;
    horizonMonths: number;
    forecastValue: number;
    forecastChangePct: number;
  }[];
}

export interface Manifest {
  generatedAt: string;
  sources: {
    name: string;
    lastUpdated: string;
    cadence: Cadence;
    status: "ok" | "stale" | "error";
  }[];
}
```

---

## GitHub Actions workflows (provided)

See `.github/workflows/ingest.yml` for the exact YAML.

The pattern: a single monthly workflow checks out the repo, installs deps, runs every ingester, transforms, then commits any changes in `web/public/data/`. The push triggers Cloudflare Pages to redeploy. A shared concurrency group (`data-commit`) plus a pull-rebase-retry on push prevents races with manual commits.

Required secrets (Settings → Environments → `production` → Environment secrets):
- `FRED_API_KEY` — get free at https://fred.stlouisfed.org/docs/api/api_key.html
- `CENSUS_API_KEY` — get free at https://api.census.gov/data/key_signup.html
- `BLS_API_KEY` — get free at https://data.bls.gov/registrationEngine/

---

## GeoJSON for the choropleth

Source the simplified DMV county GeoJSON from the US Census TIGER/Line files. Easiest path:

```bash
# One-time data prep, run locally
curl -L -o /tmp/counties.geojson \
  "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"

# Filter to DMV FIPS using jq:
jq '{
  type: "FeatureCollection",
  features: [.features[] | select(.id | IN(
    "11001","24003","24005","24009","24017","24021","24027","24031","24033","24510",
    "51013","51059","51107","51153","51177","51179","51510","51600","51610","51683","51685"
  ))]
}' /tmp/counties.geojson > web/public/data/geo/dmv-counties.geojson
```

Add a script `scripts/prep-geojson.ts` that does this so the file is reproducible.

---

## Cloudflare Pages cache headers (`web/public/_headers`)

```
/data/*
  Cache-Control: public, max-age=3600, s-maxage=3600

/data/manifest.json
  Cache-Control: public, max-age=300, s-maxage=300

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

---

## Coding standards

- **TypeScript strict mode**, no `any`, no non-null assertions in production code (test code OK)
- All exported functions: explicit return types
- All ingesters: implement the `DataSource` interface, no exceptions
- All HTTP calls go through `scripts/lib/http.ts` (retries, timeouts, structured errors)
- All file writes go through `scripts/lib/storage.ts` (atomic temp-file-then-rename)
- Logging: `scripts/lib/log.ts` exposes `info`, `warn`, `error` with structured fields, no `console.log` in production paths
- Errors: throw typed `IngestError` with `source`, `series`, `cause` fields
- Tests: vitest, colocated `*.test.ts`. Minimum coverage: every lib helper, every ingester's parsing logic
- Commits: conventional commits (`feat:`, `fix:`, `data:`, `chore:`)
- One source change = one PR

---

## Definition of done for v1

- [ ] All 21 DMV jurisdictions have a JSON file under `web/public/data/counties/`
- [ ] `ingest.yml` runs green on `workflow_dispatch`
- [ ] At least three real data sources are ingesting (FRED + Freddie Mac + Census minimum)
- [ ] Home page shows DMV choropleth colored by FHFA HPI YoY
- [ ] County page shows price chart, market health gauge, current-conditions card, affordability calculator
- [ ] Compare page works for 2–5 counties
- [ ] Lighthouse score ≥ 90 on Performance and Accessibility
- [ ] Cloudflare Pages production URL is live
- [ ] README explains setup, key acquisition, and contribution flow

---

## After v1 (do not build now)

- Ingest Redfin weekly TSVs (large files, defer until base is stable)
- Add Realtor.com migration data (in/out flows by metro)
- Add First Street climate risk overlay
- Add the federal-exposure stress-test slider (the killer differentiator from the research report)
- Add a small Cloudflare Worker if you ever need server-side aggregation
- Migrate the larger raw archives to Cloudflare R2

These belong in v2. Don't be tempted into them while v1 is incomplete.
