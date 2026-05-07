# Contributing — Build Playbook

This is the day-by-day, step-by-step playbook for getting from this scaffold to a working v1. Follow it in order. Don't skip ahead.

If you're Claude Code: **read `CLAUDE.md` first**, then this file, then start at Step 1.

---

## Prerequisites (one-time, ~10 minutes)

1. Install Node 20 (use nvm: `nvm install 20 && nvm use`).
2. Get free API keys (all instant email signup):
   - FRED: https://fred.stlouisfed.org/docs/api/api_key.html
   - Census: https://api.census.gov/data/key_signup.html
   - BLS: https://data.bls.gov/registrationEngine/
3. Create `.env` from `.env.example` and paste keys.
4. `npm install` from repo root.
5. `npm run build --workspace=shared` (compiles shared types so other workspaces can resolve them).

Verify: `npm run typecheck` passes from the root.

---

## Step 1 — Verify the scaffold

Already done if you're reading this in the scaffold. Confirm:

```bash
npm run typecheck      # passes
npm run lint           # passes
npm test --workspace=scripts   # counties.test.ts passes (4 tests)
```

If any of these fail, fix them before moving on.

---

## Step 2 — First successful FRED ingest

```bash
npm run ingest:fred --workspace=scripts
```

Expected output:
- ~21 county-level FHFA HPI series fetched (most succeed; some independent VA cities may not have FHFA series — that's fine, the warn log says so)
- 3 state-level FHFA HPI series (DC, MD, VA)
- 2 national mortgage rate series
- ~21 county-level Realtor.com hotness scores
- ~21 county-level Realtor.com median listing prices
- Total observations: a few thousand
- Output written to `scripts/.cache/fred.json`

If you get a 401: check `FRED_API_KEY` in `.env`.

If you get rate-limited: the FRED limit is 120 req/min and we make ~88 requests. If you're getting rate-limited, you may have other FRED jobs running. Wait a minute and retry.

---

## Step 3 — First county JSON file

```bash
npm run transform --workspace=scripts
```

This reads `scripts/.cache/fred.json` and produces:
- `web/public/data/counties/11001.json` … `web/public/data/counties/51685.json` (21 files)
- `web/public/data/metrics/mortgage-rates.json`
- `web/public/data/manifest.json`

Spot-check Montgomery County:

```bash
cat web/public/data/counties/24031.json | head -50
```

You should see a `CountySummary` object with `series.fhfaHpi` populated.

---

## Step 4 — Frontend dev server

```bash
npm run dev --workspace=web
```

Open http://localhost:5173. You should see:
- Home page with a list of counties
- Clicking "Montgomery County, MD" navigates to `/county/24031`
- That page shows MetricCards (mostly "—" until more data sources are wired) and an FHFA HPI chart from 1975 to today

If charts don't render: check the browser console. Most likely cause is `web/public/data/counties/24031.json` not being served — verify Vite is serving from `web/public/`.

---

## Step 5 — Choropleth map (step 8 in PROJECT_SPEC)

1. Run `npx tsx scripts/prep-geojson.ts` to generate `web/public/data/geo/dmv-counties.geojson`.
2. Implement `web/src/components/ChoroplethMap.tsx`:
   - Use `maplibre-gl` (already in package.json)
   - Free OSM raster tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
   - Fetch the GeoJSON, add as a `geojson` source, add a `fill` layer
   - Color polygons by FHFA HPI YoY (compute from the latest two annual data points)
   - On click: `useNavigate()` to `/county/${feature.id}`
3. Render it on `Home.tsx` above the county list.

Acceptance: clicking a county navigates to its page; tooltip shows YoY % on hover.

---

## Step 6 — Census ACS ingester (step 9)

Implement `scripts/ingest/census.ts` per `DATA_SOURCES.md` §3.

```bash
npm run ingest:census --workspace=scripts
npm run transform --workspace=scripts
```

Verify Montgomery County's `medianHouseholdIncome` is now populated in `24031.json`.

Add `npm run ingest:census` to `.github/workflows/ingest-annual.yml` (uncomment the line).

---

## Step 7 — BLS ingester (step 9)

Implement `scripts/ingest/bls.ts` per `DATA_SOURCES.md` §4. Pulls:
- LAUS county unemployment rates for all 21 DMV counties
- DMV metro federal employment series (`SMU11479009091000001`)

Add to monthly workflow.

---

## Step 8 — Zillow ZHVI/ZORI ingester (step 9)

Implement `scripts/ingest/zillow.ts` per `DATA_SOURCES.md` §5. CSVs are wide-format; transpose. Resolve `RegionName` → FIPS via `DMV_COUNTIES`.

Add to monthly workflow.

---

## Step 9 — Redfin ingester (step 9, do this last)

Implement `scripts/ingest/redfin.ts` per `DATA_SOURCES.md` §6. Most involved ingester — gzipped TSVs, ~7M rows nationally, filter by `state_code` early.

Add to weekly workflow.

---

## Step 10 — Derived metrics (step 10 in PROJECT_SPEC)

Implement two modules in `scripts/transform/`:

**`compute-affordability.ts`**: compute affordability index per county.
- Formula: `(medianMonthlyHousingCost) / (medianHouseholdIncome / 12)`
- `medianMonthlyHousingCost` = P&I (median home value, current 30y rate, 30 years, 20% down) + property tax (use county effective rate from a hard-coded table in `scripts/lib/property-tax-rates.ts`) + insurance (assume 0.5% of home value annually)
- Output: number 0–1, where < 0.30 is affordable, 0.30–0.40 is stretched, > 0.40 is unaffordable

**`compute-market-health.ts`**: weighted blend → 0–100 score.
- Months of supply (30%): inverted; 1–3 months = high score, > 6 = low
- Sale-to-list ratio (30%): > 1.0 = high, < 0.97 = low
- % price drops (20%): inverted; lower = higher score
- Inventory YoY (20%): contextual; rising inventory in tight market = healthy normalization
- Output: number 0–100

Wire both into `build-county-pages.ts` so they populate `current.affordabilityIndex` and `current.marketHealthScore`.

---

## Step 11 — Remaining UI components (step 11 in PROJECT_SPEC)

`Compare.tsx`: multi-select up to 5 counties, fetch all summaries, render overlay LineChart.

`MarketHealthGauge.tsx`: SVG gauge 0–100 with color bands.

`AffordabilityCalculator.tsx`: sliders for income, down payment %, mortgage rate. Recompute on change.

`ForecastFan.tsx`: cone-of-uncertainty for 2026 forecasts. Initial data: hand-curated `web/public/data/forecasts.json` based on Bright MLS, Zillow, NAR public projections.

---

## Step 12 — Wire GitHub Actions (step 12)

1. Push to GitHub (public repo for unlimited Actions minutes).
2. Add repo secrets: `FRED_API_KEY`, `CENSUS_API_KEY`, `BLS_API_KEY`.
3. Manually trigger each workflow via Actions tab → workflow_dispatch.
4. Verify each commits valid JSON to `web/public/data/`.

---

## Step 13 — Cloudflare Pages deploy (step 13)

1. Cloudflare dashboard → Pages → Connect to Git → select repo.
2. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build --workspace=web`
   - Build output: `web/dist`
   - Root directory: `/` (the workspace handles it)
3. Optional: custom domain.

Push to `main`. Site is live in ~60 seconds.

---

## Verification: v1 done

- [ ] All 21 DMV jurisdictions have a JSON file under `web/public/data/counties/`
- [ ] All five GitHub Actions workflows run green on `workflow_dispatch`
- [ ] At least three real data sources are ingesting (FRED + Census + BLS minimum)
- [ ] Home page shows the DMV choropleth colored by FHFA HPI YoY
- [ ] County page shows price chart, market health gauge, current-conditions card, affordability calculator
- [ ] Compare page works for 2–5 counties
- [ ] Lighthouse score ≥ 90 on Performance and Accessibility
- [ ] Cloudflare Pages production URL is live

---

## Common pitfalls

- **`@dmv/shared` not resolving**: run `npm run build --workspace=shared` after edits to types. The web and scripts workspaces import the compiled output.
- **`tsx` can't find module**: make sure `"type": "module"` is set in the workspace package.json and imports use `.js` extensions even for `.ts` files (NodeNext requirement).
- **GitHub Actions can't push back**: check workflow has `permissions: contents: write` and the repo isn't restricted to first-party Actions.
- **Cloudflare Pages 404 on `/county/24031`**: SPA fallback. Add `web/public/_redirects` containing `/* /index.html 200`.
- **Vite build fails on shared types**: `npm run build --workspace=shared` must run before `npm run build --workspace=web`. The root `build` script does this in order.
