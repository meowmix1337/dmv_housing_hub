# Research

Sources used: official FHFA, FRED (St. Louis Fed), Census Bureau, BLS (LAUS, QCEW), Zillow Research, Redfin Data Center, NAR, Freddie Mac PMMS, Bright MLS press releases, MWCOG/SFI public pages, Wikipedia (for OMB delineation summary), and code under `scripts/`, `shared/src/types.ts`, `web/public/data/`.

In-app data examined:
- `shared/src/counties.ts` (FIPS list of 21 counties/equivalents currently included)
- `web/public/data/manifest.json` (lastUpdated 2026-05-09)
- `web/public/data/metrics/active-listings-dmv.json` (asOf 2026-03-31, total 16,882)
- `web/public/data/metrics/federal-employment-dmv.json` (asOf 2025-09-01, total 387,475)
- `web/public/data/counties/{11001,24031,24033,51013,51059,51107,51153}.json` (sampled)
- `scripts/ingest/{fred,zillow,redfin,bls,qcew,census}.ts`
- `scripts/transform/{build-county-pages,marketHealth,affordability}.ts`

---

## FIPS coverage and jurisdictional definitions

### Q1 — Authoritative DMV FIPS list and source

Finding (in-repo): `shared/src/counties.ts` (`DMV_COUNTIES`) defines 21 jurisdictions:
- DC: `11001`
- MD (9): `24003 Anne Arundel`, `24005 Baltimore Co.`, `24009 Calvert`, `24017 Charles`, `24021 Frederick`, `24027 Howard`, `24031 Montgomery`, `24033 Prince George's`, `24510 Baltimore city`
- VA (11): `51013 Arlington`, `51059 Fairfax`, `51107 Loudoun`, `51153 Prince William`, `51177 Spotsylvania`, `51179 Stafford`, `51510 Alexandria city`, `51600 Fairfax city`, `51610 Falls Church city`, `51683 Manassas city`, `51685 Manassas Park city`

There is no in-repo citation declaring which formal boundary this list implements. The mix includes Baltimore-area counties (Anne Arundel, Baltimore Co., Howard, Baltimore city) that are not in the Washington-Arlington-Alexandria MSA but are part of the broader Baltimore-Washington Combined Statistical Area (CSA 548).

External reference (per Wikipedia's "Washington metropolitan area" page synthesizing OMB Bulletin 23-01, July 21, 2023): the Washington-Arlington-Alexandria, DC-VA-MD-WV MSA (CBSA 47900) comprises 24 jurisdictions across DC, MD, VA, and WV:
- DC (1): District of Columbia
- MD (4): Montgomery, Prince George's, Frederick, Charles
- VA (18): Fairfax Co., Prince William, Loudoun, Arlington, Stafford, Spotsylvania, Fauquier, Culpeper, Warren, Clarke, Rappahannock, plus the cities of Alexandria, Manassas, Manassas Park, Fairfax, Falls Church, Fredericksburg
- WV (1): Jefferson

The OMB list and the in-repo list overlap on 14 counties (DC, MD-Mont, MD-PG, MD-Fred, MD-Charles, plus VA-Fairfax/Arlington/Loudoun/Prince William/Stafford/Spotsylvania and the cities Alexandria, Fairfax, Falls Church, Manassas, Manassas Park). The in-repo list adds 5 Baltimore-area MD jurisdictions (Anne Arundel, Baltimore Co., Howard, Baltimore city, Calvert) and omits 9 OMB MSA jurisdictions (Fauquier, Culpeper, Warren, Clarke, Rappahannock, Fredericksburg city, Jefferson WV, plus per the 2023 update Madison was removed, and Calvert was reassigned to the Lexington Park MSA in 2023).

### Q2 — Source treatment of Virginia independent cities

- **FRED (FHFA HPI)**: county-level series `ATNHPIUS{FIPS}A` exists for independent cities by their own FIPS (e.g. `ATNHPIUS51510A` for Alexandria). The repo `scripts/ingest/fred.ts` queries them all; some return absent (logged as "county series failed; continuing").
- **Census ACS**: independent cities are county-equivalents and have their own ACS records (state FIPS 51 + county FIPS 510/600/610/683/685).
- **BLS LAUS**: independent cities are reported as county-equivalents under `LAUCN51{510,600,610,683,685}0000000003`.
- **BLS QCEW**: independent cities have separate area files at `https://data.bls.gov/cew/data/files/{year}/csv/{year}_qtrly_singlefile.zip` and `…/area/{fips}.csv` (the URL pattern used by `scripts/ingest/qcew.ts`).
- **FHFA**: cities are published in the experimental annual county-level dataset.
- **Zillow ZHVI**: covers independent cities as separate "regions" (e.g. dedicated home-value pages for Falls Church, VA and Fairfax City, VA exist on zillow.com), but the County-level CSV download names are matched to the city's `RegionName` (which `scripts/ingest/zillow.ts` resolves via a lowercase name index that strips trailing " city").
- **Redfin**: county-level rows publish independent cities as `"<Name> city, VA"`. Baltimore city is published as `"Baltimore City County, MD"` (alias hard-coded in `scripts/ingest/redfin.ts`).

### Q3 — OMB MSA membership vs. in-repo county list

Per the 2023 OMB delineation (OMB Bulletin 23-01, July 21, 2023): see Q1.

Counties in `web/public/data/counties/` but **not** in the Wash-Arl-Alex MSA: `24003` (Anne Arundel), `24005` (Baltimore Co.), `24009` (Calvert; reassigned to Lexington Park MSA in 2023), `24027` (Howard), `24510` (Baltimore city). These four (excluding Calvert) belong to the Baltimore-Columbia-Towson MSA (CBSA 12580); together with the Wash-Arl-Alex MSA they make up the Washington-Baltimore-Arlington CSA (548).

OMB MSA jurisdictions absent from the in-repo list: Fauquier, Culpeper, Warren, Clarke, Rappahannock, Fredericksburg city (all VA), Jefferson Co. WV.

---

## FHFA House Price Index (HPI)

### Q4 — FHFA All-Transactions HPI: methodology, granularity, base period

- Methodology: weighted repeat-sales index based on transactions (sales + appraisal-derived prices) tied to mortgages purchased or guaranteed by Fannie Mae and Freddie Mac since January 1975.
- Granularity: national, census division, state (quarterly); MSA, county, ZIP, census tract (annual for small geographies).
- Base period for **state** All-Transactions index: **Q1 1980 = 100**.
- Base period for **MSA** ASCII data: **Q1 1995 = 100**.
- Base period for **county annual** series (`ATNHPIUS{FIPS}A` on FRED): **1990 = 100**. FHFA labels the county/ZIP/tract series as "developmental."
- Known limitations: excludes cash sales, excludes properties financed outside Fannie/Freddie loan limits (so very high-priced segments are under-represented), excludes new construction with no prior sale.
- Release schedule: monthly purchase-only HPI for US/division/state/MSA; quarterly all-transactions HPI for the same; annual county/ZIP/tract files released ~Q1 each year for the prior year.

### Q5 — Latest county-level HPI per FHFA vs. in-repo

The county summaries store annual values under `series.fhfaHpi`. Sampled tail values:

| FIPS | County | 2023-01-01 | 2024-01-01 | 2025-01-01 |
|---|---|---|---|---|
| 11001 | DC | 395.15 | 396.76 | 398.36 |
| 24031 | Montgomery MD | 267.44 | 281.54 | 285.26 |
| 24033 | Prince George's MD | 273.30 | 284.82 | 292.86 |
| 51013 | Arlington VA | 327.45 | 348.68 | 353.68 |
| 51059 | Fairfax VA | 293.45 | 313.13 | 319.72 |
| 51107 | Loudoun VA | 276.27 | 295.26 | 308.04 |

These are annual indexes (one observation per year, ISO date `YYYY-01-01`). The series IDs queried (`ATNHPIUS11001A`, etc.) are the standard FRED keys for county annual all-transactions HPI base 1990=100. Independent value verification against FRED.org pages was not possible — direct fetches of `fred.stlouisfed.org/series/...` returned HTTP 403 to the WebFetch tool. **Open**: confirm the 2025 annual values on FRED for `ATNHPIUS{11001,24031,24033,51013,51059,51107,51153,51177,51179,51510,51600,51610,51683,51685,24003,24005,24009,24017,24021,24027,24033,24510}A`.

### Q6 — "HPI YoY" convention

FHFA's documented convention for appreciation between two periods is `(later_index − earlier_index) / earlier_index`. For **annual county data**, the YoY comparison is straightforward: each calendar year has one observation, so YoY = (year_t − year_{t−1}) / year_{t−1}. There is no rolling-mean convention applied at the county level.

The home-page choropleth in this app is described in `CLAUDE.md` as "DMV choropleth … colored by FHFA HPI YoY"; the transform code does not currently compute a `fhfaHpiYoY` field on `CountyCurrentSnapshot` (only `zhviYoY` and `medianSalePriceYoY` are emitted). The `series.fhfaHpi` array is exposed and the YoY appears to be computed on the client.

---

## Zillow Home Value Index (ZHVI)

### Q7 — Definition, methodology, smoothing, geographic coverage

- Definition: ZHVI is a smoothed, seasonally adjusted measure of the typical home value across a region and housing type. Computed monthly from individual property-level Zestimates aggregated to the desired tier (typically the 35th–65th percentile, hence the "tier_0.33_0.67" file slug).
- Methodology revision: starting January 2023, the full ZHVI series was upgraded to use the neural-network Zestimate ("Neural ZHVI"). The full back-history was rebuilt under the new methodology.
- Seasonal adjustment: STL (seasonal-trend decomposition by Loess) applied to month-over-month appreciations, then chained.
- Smoothing: 3-month moving average applied to the index level (this is the `_sm_sa_` variant used in the repo files).
- Geographic coverage: Country, State, Metro, County, City, ZIP, Neighborhood. Released monthly, typically mid-month for the prior month.
- Citation: Zillow asks that derivative work cite "Zillow" and link back on first reference within a page or article (Data License terms on zillow.com/research/data).

### Q8 — Latest ZHVI values vs. in-repo

The in-repo ingest fetches `County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv` (all-homes ZHVI, tier 33–67, smoothed, SA, monthly). Sampled `current.zhvi` values:

| FIPS | County | `current.zhvi` | `current.zhviYoY` |
|---|---|---|---|
| 11001 | DC | 583,076.92 | −2.95% |
| 24031 | Montgomery MD | 622,526.83 | −1.35% |
| 24033 | Prince George's MD | 428,633.10 | −0.39% |
| 51013 | Arlington VA | 824,388.19 | −0.15% |
| 51059 | Fairfax VA | 774,448.27 | −1.24% |
| 51107 | Loudoun VA | 805,711.16 | +0.08% |
| 51153 | Prince William VA | 587,492.28 | +0.58% |

These are non-rounded floats sourced directly from the ZHVI CSV's most recent month column. Verifying against `zillow.com/research/data/` requires downloading the same CSV outside the WebFetch path; a direct browser comparison is recommended. **Open**: confirm latest-month tail values for all 21 in-repo FIPS in the current `County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`.

### Q9 — ZHVI coverage of small Virginia independent cities

Zillow Research publishes ZHVI for the larger independent cities (Alexandria, Falls Church, Fairfax City, Manassas) but coverage of very small ones (e.g. Manassas Park) can be intermittent. The repo's `scripts/ingest/zillow.ts` resolves cities by lowercased `RegionName` and silently skips a row that does not match any DMV name (logged at `debug` level). There is no documented Zillow fallback when a county/city is missing — Zillow simply omits the row from the CSV. **Open**: enumerate which of the 21 in-repo FIPS are absent from the current ZHVI county CSV and how the transform handles those (currently `series.zhvi` is omitted and `current.zhvi` is left undefined).

---

## Redfin Data Center

### Q10 — Methodology of the published metrics

Per Redfin's "Data Center Metrics Definitions" page:
- `MEDIAN_SALE_PRICE`: median final sale price of homes that closed during the period.
- `INVENTORY` (called "active listings" downstream): total listings of homes for sale active at any point during the period.
- `MEDIAN_DOM`: median days a home that went under contract spent on market before going under contract.
- `MONTHS_OF_SUPPLY`: inventory ÷ closed sales (rate at which existing supply would clear at current pace).
- `AVG_SALE_TO_LIST`: mean of (final sale price ÷ most recent list price), excluding outliers ±50% from list.
- `SOLD_ABOVE_LIST`: share of closed sales whose final price > most recent list, outliers excluded.
- `PRICE_DROPS`: share of listings where the seller dropped the asking price.

Geographic levels published in the public TSV: National, State, Metro, County, City, ZIP, Neighborhood. The repo uses **County** rows (`REGION_TYPE=='county'`) at `PERIOD_DURATION='30'` (monthly aggregation).

### Q11 — Property-type categories

The Redfin TSV `PROPERTY_TYPE` column emits five labels; `scripts/ingest/redfin.ts` maps them to slugs:

| Redfin label | Slug |
|---|---|
| `All Residential` | `all_residential` |
| `Single Family Residential` | `single_family` |
| `Condo/Co-op` | `condo` |
| `Townhouse` | `townhouse` |
| `Multi-Family (2-4 Unit)` | `multi_family` |

Any other label is logged as a warning and skipped.

### Q12 — DMV active-listings cross-check for March 2026

In-repo `metrics/active-listings-dmv.json` (asOf `2026-03-31`):
- total: 16,882 (single_family 6,268; condo 4,225; townhouse 6,145; multi_family 244)
- latestYoY: +5.88%

This figure is the sum of the per-property-type county rows where `PROPERTY_TYPE != 'All Residential'`, summed across the 21 in-repo FIPS. The DMV total is a sum, not a Redfin-published aggregate (Redfin does not publish a "DMV" region).

External cross-checks:
- Bright MLS March 2026 Housing Market Report (released 2026-04-10): "the number of homes on the market at the end of March was 9.4% higher than a year ago … inventory was up 12.1% year-over-year, but active listings remained 40% below 2019 levels." Bright MLS service area is Mid-Atlantic (DC/MD/VA/PA/DE/NJ/WV portions), not just the DMV — so the absolute count is not directly comparable, but the YoY direction (up high single-digits to low double-digits) is consistent with the in-repo +5.88%.
- Bright MLS reports a March 2026 Washington-DC-metro median sold price of $635,000, +1.6% YoY (covers different geography than any single in-repo county; closest comparator is the in-repo DC `medianSalePrice` $678,000, +3.5% YoY).

**Open**: verify the per-county March 2026 inventory totals against Redfin's monthly print-out PDFs (`redfin.com/news/data-center/printable-market-data/`) and confirm which FIPS contribute the 16,882. The +5.88% YoY differs from Bright MLS's +9.4–12.1%; the gap is explained largely by geographic scope, but a per-jurisdiction comparison is warranted.

### Q13 — Redfin suppression of small counties

Redfin's documentation does not publish an explicit suppression rule for the public TSV. Empirically: small counties with very low transaction counts often appear with `NULL`/blank cells for `MEDIAN_SALE_PRICE`, `MEDIAN_DOM`, etc., while still publishing `INVENTORY`. The in-repo parser drops any cell whose `Number(raw)` is non-finite, so suppressed values become absent observations rather than zeros. Manassas Park city (`51685`) and Falls Church city (`51610`) are the most likely DMV cities to have intermittent coverage. **Open**: enumerate which of the 21 FIPS appear in the current Redfin county TSV and which are absent or sparsely populated.

---

## BLS QCEW federal employment

### Q14 — QCEW federal employment definition

- "Federal government" = QCEW ownership code **`1`** ("Federal Government"). Other ownership codes: `0` Total, `2` State Government, `3` Local Government, `5` Private.
- "All industries" = NAICS code **`10`** (the QCEW total-all-industries summary code, distinct from any actual NAICS sector).
- The repo filters on `own_code === '1' && agglvl_code === '71' && industry_code === '10'` (`scripts/ingest/qcew.ts:31`), which targets aggregation level 71 = "County, by ownership". This is the correct row to read federal-government total employment for a single county-quarter.
- Granularity: published quarterly at national, state, MSA, county. Counts are by **place of work** (establishment location).
- Publication lag: quarterly QCEW press release ~5 months after end of reference quarter; underlying county files are typically downloadable ~5–6 months after quarter end. Annual data is published ~8 months after year end.

### Q15 — Federal employment Q3 2025 cross-check

In-repo `metrics/federal-employment-dmv.json`:
- total: 387,475
- asOf: `2025-09-01` (interpreted as Q3 2025; the series uses month-of-quarter-3 dates `YYYY-{03,06,09,12}-01`)
- totalYoY: −5.96%

Per-county snapshots (`current.federalEmployment` / YoY):
- DC `11001`: 186,162 (−3.87%)
- Montgomery `24031`: 41,885 (−14.12%)
- Prince George's `24033`: 28,631 (−6.25%)
- Arlington `51013`: 24,983 (−2.09%)
- Fairfax `51059`: 26,335 (−7.52%)
- Loudoun `51107`: 6,398 (−3.43%)
- Prince William `51153`: 7,196 (−10.21%)

Two arithmetic notes:
1. The DMV total (387,475) is a sum across the 21 in-repo FIPS, not a QCEW-published aggregate.
2. QCEW publishes monthly employment levels (`month1_emplvl`, `month2_emplvl`, `month3_emplvl`); the repo reads `month3_emplvl` (last month of the quarter).

**Open**: pull the current QCEW Q3 2025 csv files from `https://data.bls.gov/cew/data/files/2025/csv/2025_qtrly_singlefile.zip` (released ~Mar 2026) and verify the 21 county values plus the DMV sum.

### Q16 — Place of work vs. place of residence

QCEW counts employees by **place of work** (the establishment's physical location). A federal employee whose office is in DC but whose home is in Montgomery County will appear under DC (FIPS 11001), not Montgomery (24031). This affects cross-jurisdiction comparisons — ~70% of DC's reported federal payroll is held by suburban-resident commuters, so DC's federal-employment number is structurally larger than its federal workforce by residence. The Census Bureau's LEHD On-The-Map and BLS LAUS data are the standard alternatives for place-of-residence employment.

---

## BLS LAUS unemployment

### Q17 — LAUS publication, geography, seasonal adjustment

- Geography published: state (monthly, both NSA and SA); MSA, county, city (monthly, NSA only). Seasonally-adjusted county-level series are not published by BLS for most counties.
- Publication lag: county/MSA estimates are released about 5 weeks after the reference month (the "Local Area Unemployment Statistics" release). State-level release is the State Employment and Unemployment Summary (~3 weeks after reference month).
- Most recent BLS release as of 2026-05-09: State Employment and Unemployment Summary 2026-M03 results (published April 2026).
- BLS series ID format for county unemployment rate, NSA: `LAUCN{stateFips}{countyFips}0000000003` (positions: `LA` prefix, `U` for not-seasonally-adjusted, area type `CN` for county, 12-digit area code consisting of state+county FIPS plus zero padding, measure code `03` = unemployment rate). Other measure codes: `04` unemployment level, `05` employment level, `06` labor force.
- The repo uses the correct format: `LAUCN${c.fips}0000000003` (`scripts/ingest/bls.ts:54`).

### Q18 — Latest county unemployment rate cross-check

In-repo `current.unemploymentRate` (sampled):
- DC `11001`: 5.7%
- Montgomery `24031`: 4.6%
- Prince George's `24033`: 5.4%
- Arlington `51013`: 3.2%
- Fairfax `51059`: 3.7%
- Loudoun `51107`: 3.8%
- Prince William `51153`: 3.9%

Values come from the BLS API v2 with no `startyear`/`endyear` (defaults to most-recent ~3 years) and the transform takes the latest observation. **Open**: verify against BLS LAUS table maps (https://www.bls.gov/web/metro/laucntycur14.txt) for the most recent NSA month — the 14-month rolling file is the standard source.

---

## Census ACS

### Q19 — Standard ACS tables for county metrics

- Median household income (12-month dollars, inflation-adjusted to vintage end year): table `B19013_001E`.
- Median home value (owner-occupied units): `B25077_001E`.
- Median gross rent: `B25064_001E`.
- Owner-occupancy rate: derived from `B25003_001E` (total occupied units), `B25003_002E` (owner-occupied), or directly from `DP04` profile.
- Population: `B01003_001E` (or `DP05`).

ACS publishes margins of error (MOE) alongside each estimate (e.g. `B19013_001M`). 5-year ACS MOEs are reported at the 90% confidence level and are typically required to be published with the estimate. The repo ingester (`scripts/ingest/census.ts`) requests only the `_001E` (estimate) variables and **does not** capture MOE.

### Q20 — ACS vintage and value cross-check

The repo pins `ACS_YEAR = 2023` (`scripts/ingest/census.ts:9`) and queries the ACS5 endpoint `https://api.census.gov/data/2023/acs/acs5`, i.e. the **2019–2023 ACS 5-year estimates** (released December 2024). It writes `observedAt: '2023-01-01'` for every observation regardless of the underlying 5-year period.

The 2020–2024 ACS 5-year vintage was released by the Census Bureau on January 8, 2026 (see census.gov ACS news/data-releases).

**Project decision (user, 2026-05-09):** refresh to the 2020–2024 vintage as part of this validation work — bump `ACS_YEAR` to `2024`, update the API base URL to `…/2024/acs/acs5`, and set `OBSERVED_AT` to `2024-01-01`. Re-run the census ingester and the transform so all 21 county summaries pick up the new vintage.

---

## Mortgage rates (FRED)

### Q21 — MORTGAGE30US underlying source and latest value

- Series: `MORTGAGE30US` on FRED, sourced from Freddie Mac's Primary Mortgage Market Survey (PMMS).
- Cadence: weekly, released Thursdays at 10 AM ET (Wednesday when Thursday is a US holiday).
- Methodology: since 2022-11-17, PMMS is based on rates from loan applications submitted to Freddie Mac via Loan Product Advisor (LPA), not the prior survey of lenders.
- Most recent published rate: 6.37% for the week ending 2026-05-07 (per Freddie Mac's news release).

The in-repo `metrics/mortgage-rates.json` includes the full history back to 1971-04-02 (verified — first row `1971-04-02 → 7.33`). **Open**: confirm the tail of the series matches the 2026-05-07 published value of 6.37%.

### Q22 — MORTGAGE30US vs. alternatives

- Mortgage News Daily (MND): tracks intra-day average from a wholesale survey; tends to lead PMMS by 1–3 days because PMMS averages applications across the week ending Wednesday.
- Bankrate / MBA Weekly Applications Survey: similar weekly cadence but different sample (Bankrate is a national average from a panel of online lenders; MBA samples applications at member lenders).
- Known biases of PMMS: weights mortgage applications, not closed loans, so it skews toward conforming-loan, prime-credit borrowers (since LPA is Freddie's underwriting tool). It excludes points; advertised rates from non-Freddie lenders are not included.

---

## Derived / composite metrics

### Q23 — Market health score

There is no industry-standard composite. Zillow Market Health Index (ZHVI's now-deprecated companion), Realtor.com Market Hotness, and various local broker scores all use different inputs and weights.

The in-repo `marketHealthScore` (`scripts/transform/marketHealth.ts`) uses up to 4 sub-scores with weights:

| Input | Sub-score formula | Weight |
|---|---|---|
| `monthsSupply` | clamp(0, 100, 100 − (monthsSupply − 1) × 18) | 30 |
| `saleToListRatio` | clamp(0, 100, 60 + (1 − (1 − ratio) × 50) × 0.4) | 25 |
| `pctSoldAboveList` | clamp(0, 100, pct × 200) | 20 |
| `inventoryYoY` | clamp(0, 100, 70 − inventoryYoY × 100) | 25 |

Score is the weighted average of available sub-scores (returns undefined if fewer than 3 are available). The total of all four weights is 100.

This is a bespoke formula authored in-house; it is not derived from any published market-health methodology.

### Q24 — Affordability index

The NAR Housing Affordability Index — the most familiar and widely cited public affordability measure — uses `HAI = (median family income / qualifying income) × 100`, where qualifying income is the income required so a 25% P&I ratio supports a 20%-down conventional 30-year-fixed mortgage on a median-priced home at the prevailing PMMS rate. HAI = 100 means the median-income family has exactly enough income to qualify; HAI > 100 means surplus.

The in-repo `affordabilityIndex` (`scripts/transform/affordability.ts`) currently computes the **inverse** ratio — a PITI-to-income ratio:

```
principal       = medianSalePrice × 0.80                  (80% LTV)
piMonthly       = principal × r(1+r)^n / ((1+r)^n − 1)    (n=360, r = mortgageRate/12)
taxMonthly      = (medianSalePrice × propertyTaxRate) / 12
insMonthly      = (medianSalePrice × 0.0035) / 12
piti            = piMonthly + taxMonthly + insMonthly
returns piti / (medianHouseholdIncome / 12)
```

Sampled values 0.30–0.46 mean monthly PITI consumes 30–46% of monthly median household income. Lower = more affordable. This is **not** a NAR HAI; the direction (lower-better vs. higher-better), scale (0–1 vs. ~30–200), and inputs (PITI vs. P&I-only, household income vs. family income) all differ.

**Project decision (user, 2026-05-09):** replace the in-repo formula with the NAR HAI convention because it is the most common and familiar metric. Specifically: switch to `HAI = (median household income / qualifying income) × 100`, where `qualifying_income = (P&I monthly payment) × 4 × 12` against an 80%-LTV 30-year-fixed at the latest PMMS `mortgage_30y_rate`. Drop tax/insurance from the qualifier (NAR convention is P&I-only). Note: NAR uses *median family income*; the in-repo data has *median household income* (ACS B19013). Document the substitution in the field-level docs because median household income is typically lower than median family income, biasing this index slightly conservative versus NAR's published series.

### Q25 — Months of supply formula

Standard real-estate convention: `months_of_supply = active_listings_at_period_end / closed_sales_in_period_(monthly)`. NAR and Realtor.com both use closed sales; some MLS-derived figures use pending sales as an alternative.

Redfin's published `MONTHS_OF_SUPPLY` column uses the closed-sales variant ("calculated by dividing inventory by home sales"). The repo passes the Redfin value through unchanged into `current.monthsSupply`.

---

## Freshness, revisions, and citation

### Q26 — Revision policies

- **FRED**: passes through upstream revisions; FRED itself does not revise but mirrors source revisions (typically once values change at FHFA, BLS, etc., FRED is updated within hours/days).
- **BLS LAUS**: monthly revisions in the immediately following release plus an annual benchmarking revision in early March each year (revising the prior 4–5 years).
- **BLS QCEW**: each quarter's data is revised in the next quarterly release; annual benchmark revisions in the following year. Federal-government employment counts are subject to greater volatility around RIF / shutdown periods.
- **Census ACS**: 5-year estimates are point-in-time and not revised — each new vintage replaces the previous (no in-place revisions).
- **FHFA HPI**: extensive revisions; each quarterly release revises the back-history (typically ~2 years) as more transactions become known.
- **Zillow ZHVI**: each monthly release revises back-history because Zestimates are themselves revised; the 2023 Neural ZHVI release rebuilt the entire historical series.
- **Redfin**: weekly file rewrites the entire history each release; rolling-window metrics (4-week, 12-week) are sensitive to recent transaction-reporting lag.

The in-repo manifest tracks only `lastUpdated` per source; there is no flag for "this value has been revised since last commit." Git-log on the data files in `web/public/data/` is the only revision trail.

### Q27 — Citation/attribution requirements

- **FRED**: free for any use; suggests "Source: U.S. Federal Reserve Bank of St. Louis (FRED)" plus the underlying data source.
- **FHFA**: public domain; FHFA requests citation as "Federal Housing Finance Agency, House Price Index" and reference to the methodology paper for derivative work.
- **BLS** (LAUS, QCEW, ECEC, ECI, etc.): public domain; BLS requests "Source: U.S. Bureau of Labor Statistics" attribution.
- **Census/ACS**: public domain; standard "Source: U.S. Census Bureau" attribution; MOE must be published when republishing 5-year estimates.
- **Zillow Research**: data made available "to use in your work, with attribution to Zillow"; Zillow asks for "Zillow" as the source on first reference and a hyperlink to zillow.com/research/data when republishing.
- **Redfin**: per redfin.com/news/data-center, data is free to use with citation "data is from the Redfin Data Center" and a link back on first reference.

Industry-standard UX: a "Sources" footer on each chart/page that lists each underlying source with a link, plus an "as of" date pulled from the manifest. The in-repo `manifest.json` exposes `lastUpdated` per source which can drive an "as of" UI element; no per-chart citation labels are currently rendered (verifiable by reading `web/src/` components, not done in this research pass).

### Q28 — Independent DMV cross-check publishers

- **Bright MLS Research** — monthly Mid-Atlantic Housing Market Report (covers DC/MD/VA/PA/DE/NJ/WV via Bright's MLS service area; closest direct comparator for monthly DMV inventory and median sale price). March 2026 report cited above.
- **MWCOG Housing & Homelessness** (mwcog.org) — publishes regional housing targets and aggregates for the Wash-Arl-Alex MSA (uses MWCOG's own member-jurisdiction definition: 23 jurisdictions including some not in MSA-47900).
- **Stephen S. Fuller Institute** (sfullerinstitute.gmu.edu) — economic/housing analytics for "Greater Washington" (their definition is the Wash-Arl-Alex MSA).
- **Greater Washington Partnership** — periodic regional reports; uses the "Capital Region" definition (Baltimore + Wash MSAs combined ≈ CSA 548), closer to the in-repo geography.
- **Virginia REALTORS** (virginiarealtors.org) — monthly regional reports including a "Northern Virginia" cut.
- **Maryland REALTORS** (mdrealtor.org) — monthly state and county-level housing reports.
- **DC OCFO Office of Revenue Analysis** — housing market reports for DC proper.

---

## Verification approach (project decision, user, 2026-05-09)

Cross-source verification will be done by **spot-checking** values against the upstream publishers, not by building a full automated verification harness. Both human readers and AI agents working on this repo should know:

1. **Spot-check is the chosen verification mode.** Pick a representative subset of FIPS (e.g. DC `11001`, Montgomery `24031`, Fairfax `51059`, plus one independent city like Falls Church `51610`) and one DMV-aggregate value per release cycle. Confirm those values against the upstream source's printable summary or web page; do not attempt to verify all 21 FIPS × all metrics.
2. **Where to look for each source** (printable / web destinations that survive the WebFetch 403 issues): FRED CSV downloads via `fred.stlouisfed.org/graph/fredgraph.csv?id={SERIES_ID}` (works without auth); FHFA county HPI annual files at `fhfa.gov/data/hpi/datasets`; Zillow Research direct CSV downloads (the same URLs the ingester uses); Redfin printable monthly PDFs at `redfin.com/news/data-center/printable-market-data/`; BLS LAUS rolling 14-month NSA file at `bls.gov/web/metro/laucntycur14.txt`; QCEW quarterly singlefile zips at `data.bls.gov/cew/data/files/{year}/csv/{year}_qtrly_singlefile.zip`; Census ACS via the JSON API (works without WebFetch).
3. **Document any discrepancy** in `DATA_SOURCES.md` with: the FIPS, metric, in-repo value, upstream value, the upstream URL with timestamp, and a short reason note (revision, methodology change, scope mismatch, etc.). Do not silently overwrite.
4. **Where to record the verification cadence:** this `2-research.md` file plus `DATA_SOURCES.md` are the canonical references. The design phase should add a short "Verification" section to `DATA_SOURCES.md` so future agents see it without needing to read this research artifact.

## Open Questions

- The in-repo `DMV_COUNTIES` list (21 jurisdictions, including 4 Baltimore-area MD counties) does not match any single published OMB boundary. There is no in-repo citation declaring which boundary is intended, and no documentation of why Anne Arundel/Baltimore Co./Howard/Baltimore city are included while Fauquier/Culpeper/Warren/Clarke/Rappahannock/Fredericksburg/Jefferson WV are not. **User direction (2026-05-09):** dig deeper before changing anything — the design phase should investigate (a) the project's original intent (git history of `shared/src/counties.ts`, any planning docs), (b) whether the published boundaries we could conform to are MSA-47900 (Wash-Arl-Alex MSA, 24 jurisdictions), CSA-548 (Washington-Baltimore CSA), or MWCOG's 23 member jurisdictions, and (c) the data-coverage tradeoffs of each option (which choice maximizes available data per source).
- Per-county March 2026 inventory totals from Redfin's printable monthly market-data PDFs to confirm the DMV 16,882 sum and per-jurisdiction contributions.
- Current QCEW Q3 2025 federal-employment values per county to confirm the 387,475 DMV total and the −5.96% YoY.
- Latest BLS LAUS county unemployment rates from the rolling 14-month NSA file to confirm `current.unemploymentRate` for all 21 FIPS.
- Whether any of the 21 in-repo FIPS are absent or sparsely populated in the current Redfin TSV and Zillow ZHVI CSV (i.e. enumerate the actual coverage).
- The frontend behavior for rendering "FHFA HPI YoY" on the home choropleth — `CountyCurrentSnapshot` does not store `fhfaHpiYoY`, so this is presumably computed on the client from `series.fhfaHpi`.

## Next
**Phase:** Design
**Artifact to review:** `docs/crispy/validate-public-data/2-research.md`
**Action:** Review research findings. Then invoke `crispy-design` with project name `validate-public-data`.
