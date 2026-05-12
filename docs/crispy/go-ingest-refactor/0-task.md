# Task

Refactor ingestion scripts to Go 1.26.

The current ingestion pipeline lives in the `scripts/` workspace as Node.js / TypeScript code. It runs in GitHub Actions on a monthly cron, fetches data from six upstream sources (FRED, Census ACS, BLS LAUS, BLS QCEW, Zillow ZHVI, Redfin), writes raw caches to `scripts/.cache/`, and joins them into per-county JSON under `web/public/data/`.

The goal is to port these ingestion and transform scripts to Go 1.26 while preserving:

- The same output contracts (`web/public/data/counties/{fips}.json`, `metrics/*.json`, `manifest.json`)
- The same `Observation` type semantics shared with the web SPA via `shared/types.ts`
- The same GitHub Actions cron flow and "no runtime backend, no database" constraint
- The same per-source behavior described in `DATA_SOURCES.md`

The web SPA (`web/`) remains TypeScript/React and is out of scope. Only the `scripts/` workspace is being rewritten.
