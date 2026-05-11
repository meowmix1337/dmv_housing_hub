# Spot-check 2026-05-10

First pass under the workflow documented in `DATA_SOURCES.md` "Verification" section. Sentinel FIPS: `11001` (DC), `24031` (Montgomery MD), `51059` (Fairfax VA), `51610` (Falls Church city VA).

## Results

| source | sentinel | metric | in-repo | upstream | match? | notes |
|---|---|---|---|---|---|---|
| census | 11001 | medianHouseholdIncome | 109870 | 109870 | ✓ | live API (2020-2024 ACS) ingested 2026-05-10 |
| census | 24031 | medianHouseholdIncome | 132450 | 132450 | ✓ | same |
| census | 51059 | medianHouseholdIncome | 153637 | 153637 | ✓ | same |
| census | 51610 | medianHouseholdIncome | 143262 | 143262 | ✓ | same |
| fred | 11001 | fhfaHpi 2025-01-01 | 398.36 | 398.36 | ✓ | `fredgraph.csv?id=ATNHPIUS11001A` |
| fred | 24031 | fhfaHpi 2025-01-01 | 285.26 | 285.26 | ✓ | `fredgraph.csv?id=ATNHPIUS24031A` |
| fred | 51059 | fhfaHpi 2025-01-01 | 319.72 | 319.72 | ✓ | `fredgraph.csv?id=ATNHPIUS51059A` |
| fred | 51610 | fhfaHpi 2025-01-01 | 382.65 | 382.65 | ✓ | `fredgraph.csv?id=ATNHPIUS51610A` |
| fred | USA | mortgage_30y_rate 2026-05-07 | 6.37 | 6.37 | ✓ | `fredgraph.csv?id=MORTGAGE30US` |
| bls | 11001 | unemploymentRate (latest) | 5.7 | 5.7 (Mar 2026) | ✓ | BLS public API series `LAUCN110010000000003` |
| bls | 24031 | unemploymentRate (latest) | 4.6 | 4.6 (Feb 2026) | ✓ | series `LAUCN240310000000003` |
| bls | 51059 | unemploymentRate (latest) | 3.7 | 3.7 (Feb 2026) | ✓ | series `LAUCN510590000000003` |
| bls | 51610 | unemploymentRate (latest) | 4.0 | 4.0 (Feb 2026) | ✓ | series `LAUCN516100000000003` |
| qcew | 11001 | federalEmployment Q3 2025 | 186162 | 186162 | ✓ | `cew/data/api/2025/3/area/11001.csv`, own=1, agg=71, ind=10 |
| qcew | 24031 | federalEmployment Q3 2025 | 41885 | 41885 | ✓ | same path, area 24031 |
| qcew | 51059 | federalEmployment Q3 2025 | 26335 | 26335 | ✓ | same path, area 51059 |
| qcew | 51610 | federalEmployment Q3 2025 | 1905 | 1905 | ✓ | same path, area 51610 |
| zillow | 11001 | zhvi 2026-03-31 | 583076.92 | 583076.92 | ✓ | `County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`, RegionName "District of Columbia" |
| zillow | 24031 | zhvi 2026-03-31 | 622526.83 | 622526.83 | ✓ | RegionName "Montgomery County", StateName MD |
| zillow | 51059 | zhvi 2026-03-31 | 774448.27 | 774448.27 | ✓ | RegionName "Fairfax County", StateName VA |
| zillow | 51610 | zhvi 2026-03-31 | 1148927.27 | 1148927.27 | ✓ | RegionName "Falls Church City", StateName VA |
| redfin | 11001 | activeListings 2026-03-31 | 2755 | 2755 | ✓ | `county_market_tracker.tsv000.gz`, region "District of Columbia, DC", PROPERTY_TYPE=All Residential |
| redfin | 11001 | medianSalePrice 2026-03-31 | 678000 | 678000 | ✓ | same row |
| redfin | 11001 | daysOnMarket 2026-03-31 | 68 | 68 | ✓ | same row |
| redfin | 24031 | activeListings 2026-03-31 | 1856 | 1858 | ⚠ | 2-unit variance, expected — see below |
| redfin | 24031 | medianSalePrice 2026-03-31 | 650000 | 650000 | ✓ | |
| redfin | 24031 | daysOnMarket 2026-03-31 | 33 | 33 | ✓ | |
| redfin | 51059 | activeListings 2026-03-31 | 1784 | 1784 | ✓ | |
| redfin | 51059 | medianSalePrice 2026-03-31 | 755000 | 755000 | ✓ | |
| redfin | 51059 | daysOnMarket 2026-03-31 | 26 | 26 | ✓ | |
| redfin | 51610 | activeListings 2026-03-31 | 18 | 18 | ✓ | region "Falls Church, VA" (no city suffix; ingester alias handles it) |
| redfin | 51610 | medianSalePrice 2026-03-31 | 1175000 | 1175000 | ✓ | |
| redfin | 51610 | daysOnMarket 2026-03-31 | 24 | 24 | ✓ | |

## Variances

**Montgomery activeListings: 1,856 in-repo vs. 1,858 upstream `All Residential`.** Expected — not a bug.

`current.activeListings` is set from the per-property-type sum, not from Redfin's `All Residential` aggregate row. For Montgomery 2026-03-31:

```
Single Family Residential = 751
Townhouse                 = 453
Condo/Co-op               = 652
Multi-Family (2-4 Unit)   =   0  (no row published for this period)
                          -----
                            1856
All Residential (Redfin)  = 1858  ← differs by 2 units
```

The 2-unit gap is the residual between Redfin's published all-residential aggregate and the four named property types. `scripts/transform/build-county-pages.ts:138-176` (`buildActiveListingsBreakdown`) chooses the property-type sum so per-type chart breakdowns reconcile to the headline total. Same convention is applied to all 21 jurisdictions; the gap is typically 0–5 units per county per month.

If we ever surface the all-residential figure separately we should label it explicitly (e.g. "Redfin all-residential: 1,858 / property-type sum: 1,856") rather than try to reconcile.

## Confirmed sources

All 6 sources cross-checked against upstream values for at least one sentinel FIPS. 30 of 31 numeric comparisons match exactly; 1 has a documented small variance with a known root cause.

## How to record the next pass

Append a new dated section to this file (`## Spot-check 2026-MM-DD`) and update the `Last verified` date in `DATA_SOURCES.md` to match. Re-run `npm run transform --workspace=scripts` so the new date flows into `manifest.json`.

## Method notes for the next operator

- **BLS** rejects anonymous `curl` against `bls.gov/web/...` (Access Denied even with `User-Agent`). The public API at `api.bls.gov/publicAPI/v2/timeseries/data/` works with a POST request and no key (limited to 25 series/day without). The four LAUS series are in `DATA_SOURCES.md` Verification section.
- **QCEW** CSV download `data.bls.gov/cew/data/api/{year}/{quarter}/area/{fips}.csv` works with plain curl. The federal-employment row is `own_code="1", agglvl_code="71", industry_code="10"`; read `month3_emplvl` (column 12).
- **Redfin** TSV is gzipped and ~600MB+. Stream with `curl ... | gunzip | awk -F'\t' ...`. Note that `PERIOD_END` is quoted but `PERIOD_DURATION`, `INVENTORY`, `MEDIAN_SALE_PRICE` etc. are unquoted in the TSV — your awk filters need to match the actual quoting.
- **Zillow** CSV is plain (no gzip). Headers `RegionID, SizeRank, RegionName, RegionType, StateName, State, Metro, ...` then one column per month. Falls Church city uses `RegionName="Falls Church City"` (capital C).
