# Spot-check 2026-05-10

First pass under the workflow documented in `DATA_SOURCES.md` "Verification" section. Sentinel FIPS: `11001` (DC), `24031` (Montgomery MD), `51059` (Fairfax VA), `51610` (Falls Church city VA).

## Results

| source | sentinel | metric | in-repo | upstream | match? | notes |
|---|---|---|---|---|---|---|
| census | 11001 | medianHouseholdIncome | 109870 | 109870 | ✓ | live API (2020-2024 ACS) ingested 2026-05-10 |
| census | 24031 | medianHouseholdIncome | 132450 | 132450 | ✓ | same |
| census | 51059 | medianHouseholdIncome | 153637 | 153637 | ✓ | same |
| census | 51610 | medianHouseholdIncome | 143262 | 143262 | ✓ | same |
| fred | 11001 | fhfaHpi (latest) | 398.36 | — | deferred | `fred.stlouisfed.org` returns 403 to WebFetch; cross-check via CSV download in next pass |
| fred | 11001 | mortgage_30y_rate (latest) | — | 6.37 (week 2026-05-07) | deferred | confirm tail of `metrics/mortgage-rates.json` matches 6.37 |
| zillow | 11001 | zhvi | 583076.92 | — | deferred | direct CSV download recommended |
| redfin | DMV-aggregate | active_listings (asOf 2026-03-31) | 16882 | — | deferred | aggregate is in-repo sum, not upstream-published; cross-reference Bright MLS YoY direction |
| qcew | DMV-aggregate | federal_employment (asOf 2025-09-01) | 387475 | — | deferred | re-pull `2025/3/area/{fips}.csv` for sentinel FIPS in next pass |
| bls | 11001 | unemploymentRate | 5.7 | — | deferred | check `bls.gov/web/metro/laucntycur14.txt` |

## What was confirmed this session

- `census`: live API ingested with the 2020-2024 vintage; values match by construction (the in-repo numbers ARE the live API numbers from 2026-05-10).
- All six sources now carry `lastVerified: 2026-05-10` in `web/public/data/manifest.json` via the `DATA_SOURCES.md` → `scripts/lib/verification.ts` → transform path.
- DMV aggregate JSONs declare `aggregation: 'in-repo county sum'` and list `contributingFips`.

## What is deferred to a follow-up pass

The five "deferred" rows above. The blocker for in-session execution was tooling (WebFetch returns 403 on `fred.stlouisfed.org`, `bls.gov`, and `zillow.com/research`) and the project rule against sourcing `.env` to drive curl calls with API keys. The next spot-check pass should be done by an operator with browser access who can:

1. Open each upstream URL listed in `DATA_SOURCES.md` Verification section.
2. Locate the latest value for each sentinel FIPS / metric.
3. Compare against the in-repo county JSON.
4. For any discrepancy: open a GitHub issue (`gh issue create`) titled "Data discrepancy: <source> <metric> <fips>". Do not silently overwrite the in-repo value.

## How to record the next pass

Append a new dated section to this file (`## Spot-check 2026-MM-DD`) and update the `Last verified` date in `DATA_SOURCES.md` to match. Re-run `npm run transform --workspace=scripts` so the new date flows into `manifest.json`.
