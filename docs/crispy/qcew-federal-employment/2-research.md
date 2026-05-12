# Research

Findings are organized to mirror the question groupings in `1-questions.md`. Items that could not be answered from available sources are listed under **Open Questions** at the bottom.

## QCEW data source basics

### Q1. What is QCEW, who publishes it, and what is its release cadence?
- **Publisher:** U.S. Bureau of Labor Statistics (BLS), Quarterly Census of Employment and Wages program (`bls.gov/cew`).
- **What it is:** "A quarterly count of employment and wages reported by employers covering more than 95 percent of U.S. jobs, available at the county, MSA, state and national levels by industry."
- **Cadence:** Quarterly. As of the schedule change announced in 2017 and reaffirmed for the Q4 2024 release on June 4, 2025, "the news release and the full data update are published on the same date, providing users with all Quarterly Census of Employment and Wages data simultaneously." Q4 2025 is scheduled for **Tuesday, June 2, 2026, 10:00 a.m. ET**.

### Q2. Geographic granularity
- QCEW publishes **national, state, MSA, CSA, and county-level** data. The "finest level of geographic detail is the county-industry level." There is no sub-county breakdown; intra-county data exists only via Census/microdata products outside QCEW.
- QCEW data files use a **5-character `area_fips`** field. Codes include national totals, state totals (e.g., `26000` = Michigan), and county-equivalent FIPS (e.g., `11001` = District of Columbia).

### Q3. Time lag between covered quarter and public release
- "QCEW data is first released for any quarter approximately within **6 months** after the end of the quarter."
- Example: Q4 2025 (Oct–Dec 2025) is scheduled for release June 2, 2026.

### Q4. Measures and units reported per series
QCEW area CSV slices include 42 fields per row (quarterly). Core measures and units:

| Field | Meaning | Unit |
|---|---|---|
| `qtrly_estabs` | Establishment count | count |
| `month1_emplvl`, `month2_emplvl`, `month3_emplvl` | Employment level for pay period including the 12th of each month | count of filled jobs |
| `total_qtrly_wages` | Total quarterly wages | USD |
| `taxable_qtrly_wages` | UI-taxable wages | USD |
| `qtrly_contributions` | UI contributions | USD |
| `avg_wkly_wage` | Average weekly wage | USD |
| `oty_*_chg`, `oty_*_pct_chg` | Over-the-year (vs. same quarter prior year) absolute and percent changes | level / percent |
| `lq_*` | Location quotient variants of the above | ratio (LQ) |
| `disclosure_code`, `lq_disclosure_code`, `oty_disclosure_code` | Suppression flag | blank or `'N'` |

Employment is "the count of only filled jobs, whether full or part time, and temporary or permanent, by **place of work**" (cf. LAUS, place-of-residence).

## Access mechanisms and licensing

### Q5. Public APIs / bulk file endpoints
Two complementary mechanisms:

1. **QCEW Open Data Access — CSV "data slices"** (no key required).
   - Base pattern: `https://data.bls.gov/cew/data/api/{YEAR}/{QUARTER}/{TYPE}/{CODE}.csv`
   - `TYPE` ∈ `industry`, `area`, `size`.
   - Examples:
     - Industry slice (all NAICS, total covered): `…/2024/1/industry/10.csv`
     - Area slice (state of Michigan): `…/2024/1/area/26000.csv`
     - Area slice (DC county-equivalent, Q1 2024): `…/2024/1/area/11001.csv` — confirmed accessible; contains rows with `own_code=1` (federal) at multiple aggregation levels.
   - Annual-average data slices exist as separate CSV files with their own field structure; they contain "sum of the four quarterly" values aggregated annually.
   - Naming quirk: hyphenated NAICS codes use underscores (`31-33` → `31_33.csv`).
   - Migration note: in June 2016 the entire collection was moved from `www.bls.gov/cew/...` to `data.bls.gov/cew/...`; old URLs server-side redirect.

2. **BLS Public Data API v2** (registered key recommended).
   - Endpoint: `https://api.bls.gov/publicAPI/v2/timeseries/data/` (POST with JSON `{seriesid, startyear, endyear, registrationkey}`).
   - Used elsewhere in the repo for LAUS unemployment + MSA-level federal employment (`scripts/ingest/bls.ts:9`).

### Q6. Rate limits, file sizes, retrieval patterns
- **CSV data slices:** "A key is not required for the QCEW API." No published rate-limit numbers were found in BLS docs surfaced by search; access is direct HTTPS GETs of static files. Empirical: 21 DMV counties × 4 quarters × 4 years (336 fetches) completed without throttling or 429s.
- **BLS Public Data API v2 (registered key):** "500 daily requests (vs. 25)," "up to 50 series per request (vs. 25)," and the API "returns up to 20 years of data" per query. Larger date ranges require splitting requests; multiple series can be batched in a single POST (the existing repo BLS ingester already uses this batched POST pattern, `scripts/ingest/bls.ts:147`).
- **File sizes (measured):** A single area-slice CSV (one county × one quarter, all ownerships × all NAICS detail) is ~30–60 KB. Backfilling all 21 DMV counties × 4 quarters × ~10 historical years is ~840 fetches and well under 100 MB total wire bytes. Industry slices for `industry/10.csv` (total covered, all areas) are larger and not needed for this project. National "single-file" annual archives (referenced on `bls.gov/cew/downloadable-data-files.htm`) are larger ZIPs but were not directly retrievable in research (page returned 403 to automated fetch) and not required for the per-county slice strategy.

### Q7. Licensing / attribution for redistribution
- BLS data are produced by a U.S. federal agency. Searches surfaced references to BLS "Linking & Copyright Information" but the page (`bls.gov/bls/linksite.htm`) returned 403 Forbidden to automated fetch and could not be quoted directly.
- General federal-government context (resources.data.gov "Open Licenses"): U.S. federal works are typically not subject to copyright in the United States, and BLS publishes attribution guidance asking users to cite the BLS as the source. Specific QCEW attribution language was not retrieved verbatim. *(Listed under Open Questions.)*

## Series identifiers and schema

### Q8. QCEW series identifier structure and FIPS mapping
There are two parallel identifier systems:

**A. CSV slice records (columns).** Each row in an area CSV slice carries a composite key:
- `area_fips` — 5 characters; for counties this is the standard 5-digit county FIPS (state FIPS + county FIPS).
- `own_code` — 1 character; ownership.
- `industry_code` — NAICS code (variable length, 1–6 digits; "10" = total all industries; sector codes "11"–"92"; subsector and detail codes longer).
- `agglvl_code` — aggregation level (see Q10).
- `size_code` — establishment size class (size files only; 0 in standard records).
- `year`, `qtr` — time index.

**B. BLS Public Data API series IDs.** Per BLS series-ID documentation, QCEW IDs are 17 characters:
```
ENU 04013 1 0 5 111150
 │   │    │ │ │  │
 │   │    │ │ │  └─ industry NAICS (positions 12–17)
 │   │    │ │ └──── ownership code (position 11)
 │   │    │ └────── size code (position 10)
 │   │    └──────── datatype code (position 9)
 │   └───────────── area FIPS (positions 4–8)
 └───────────────── prefix "EN" + seasonal-adjustment "U" (positions 1–3)
```
The area-FIPS slice (positions 4–8) is exactly the 5-digit county FIPS used elsewhere in the repo (`scripts/lib/counties.ts`), so mapping a county-equivalent FIPS into a QCEW BLS-API series ID is direct concatenation.

### Q9. Ownership codes — federal vs. others
From BLS Ownership Titles (NAICS-coded data):

| Code | Classification |
|---|---|
| 0 | Total Covered |
| 1 | **Federal Government** |
| 2 | State Government |
| 3 | Local Government |
| 4 | International Government |
| 5 | Private |
| 8 | Total Government |
| 9 | Total U.I. Covered (Excludes Federal Government) |

`own_code=1` is the row to read for federal-government employment. It is published separately from state (`2`), local (`3`), and private (`5`) and is **excluded** from `own_code=9` (UI-covered total). Federal workers are tracked under the **Unemployment Compensation for Federal Employees (UCFE)** program rather than state UI; QCEW absorbs that program's records into ownership 1.

### Q10. NAICS aggregation levels
QCEW uses the `agglvl_code` field on summary records. From the BLS aggregation-level titles for NAICS-coded data, county-level aggregation codes are in the **70-series**:

| Code | Meaning (county scope) |
|---|---|
| 70 | County, Total Covered (all ownerships, all industries) |
| 71 | County, by ownership sector — total all industries within a single ownership (e.g., federal total) |
| 72–78 | County × ownership × NAICS at increasing detail (Domain → Supersector → Sector → 3-digit → 4-digit → 5-digit → 6-digit NAICS) |

For "all industries / total covered" county-level employment irrespective of ownership, use `agglvl_code=70` with `industry_code=10` and `own_code=0`.
For **county × federal-government × all industries**, use `agglvl_code=71` with `own_code=1` and `industry_code=10`. (The CSV row for DC Q1 2024 confirmed: own_code=1, industry_code=10 → 342 establishments, ~193K employment.)

### Q11. Suppressed / non-disclosable cells
- The disclosure indicator is the single-character field `disclosure_code`: blank means disclosed, `'N'` means **not disclosed** (suppressed for confidentiality).
- Parallel fields `lq_disclosure_code` and `oty_disclosure_code` flag suppression on the location-quotient and over-the-year derived fields.
- **Frequency at the county × federal-ownership intersection across the DMV (measured):** Pulled live area-slice CSVs for all 21 DMV county-equivalents across 16 quarters (Q1–Q4 of 2015, 2018, 2021, 2024) and counted rows with `own_code=1`, `agglvl_code=71` (county × federal × all-industries total). **336 of 336 rows disclosed; 0 suppressed (0%).** Even the smallest jurisdiction (Manassas Park city, FIPS 51685, with 25 federal jobs in Q1 2024) reports a non-suppressed value.
- Concrete county-level federal totals (Q1 2024, agglvl=71, own_code=1, industry=10):

  | FIPS | County | Estabs | Emp (Mo1) | Avg Wkly Wage |
  |---|---|---:|---:|---:|
  | 11001 | District of Columbia | 342 | 192,845 | $2,601 |
  | 24003 | Anne Arundel | 122 | 15,788 | $2,309 |
  | 24005 | Baltimore Co. | 75 | 11,699 | $2,259 |
  | 24009 | Calvert | 30 | 417 | $2,456 |
  | 24017 | Charles | 53 | 3,861 | $2,450 |
  | 24021 | Frederick | 79 | 4,887 | $2,344 |
  | 24027 | Howard | 52 | 2,105 | $2,604 |
  | 24031 | Montgomery | 137 | 48,355 | $2,891 |
  | 24033 | Prince George's | 149 | 30,752 | $2,419 |
  | 24510 | Baltimore city | 84 | 12,387 | $2,082 |
  | 51013 | Arlington | 90 | 25,343 | $2,835 |
  | 51059 | Fairfax County | 158 | 28,044 | $2,528 |
  | 51107 | Loudoun | 62 | 6,747 | $2,451 |
  | 51153 | Prince William | 58 | 7,907 | $2,297 |
  | 51177 | Spotsylvania | 10 | 153 | $2,093 |
  | 51179 | Stafford | 26 | 5,393 | $2,604 |
  | 51510 | Alexandria city | 46 | 9,080 | $2,441 |
  | 51600 | Fairfax city | 21 | 720 | $2,542 |
  | 51610 | Falls Church city | 19 | 1,981 | $2,817 |
  | 51683 | Manassas city | 21 | 994 | $2,329 |
  | 51685 | Manassas Park city | 5 | 25 | $2,689 |

## County coverage in the DMV

### Q12. County-equivalent FIPS in DC, MD, VA and QCEW federal-ownership coverage
The repository's canonical DMV county list (`scripts/lib/counties.ts`) defines 21 county-equivalents:

- **DC (1):** 11001 District of Columbia.
- **MD (9):** 24003 Anne Arundel, 24005 Baltimore Co., 24009 Calvert, 24017 Charles, 24021 Frederick, 24027 Howard, 24031 Montgomery, 24033 Prince George's, 24510 Baltimore city (independent).
- **VA (11):** 51013 Arlington, 51059 Fairfax County, 51107 Loudoun, 51153 Prince William, 51177 Spotsylvania, 51179 Stafford, 51510 Alexandria city, 51600 Fairfax city, 51610 Falls Church city, 51683 Manassas city, 51685 Manassas Park city.

QCEW area-slice CSVs are addressable for any 5-digit county FIPS. **Confirmed empirically:** all 21 DMV county-equivalents return a disclosed `own_code=1, agglvl_code=71` (federal × all-industries) row for every sampled quarter (Q1/Q2/Q3/Q4 of 2015/2018/2021/2024; see Q11 for the full table and 0% suppression result).

**Aggregate ("roll-up") rows that come from the same source:**
- **State totals (agglvl=51, own_code=1, industry=10) Q1 2024:**
  - DC (`11000`): 342 estabs, 192,845 employment, $2,601 avg weekly wage. (Identical to county 11001 since DC is one jurisdiction.)
  - MD (`24000`): 1,251 estabs, 160,518 employment, $2,523 avg weekly wage.
  - VA (`51000`): 2,286 estabs, 190,866 employment, $2,245 avg weekly wage.
- **MSA totals (agglvl=41, own_code=1, industry=10) Q1 2024:** Washington-Arlington-Alexandria CBSA QCEW area code `C4790` returned 1,400 estabs, 371,166 federal employment. This is a true universe count and complements (not duplicates) the existing CES-derived MSA-level series `SMU11479009091000001` already ingested in `scripts/ingest/bls.ts:13`.
- **DMV total (computed):** Summing the 21 county rows yields an exact "DMV federal employment" figure that does not exist as a single QCEW row but is correct because QCEW is a census, not a sample.

### Q13. Known coverage gaps, code changes, boundary adjustments
- **Bedford city, VA (51515)** reverted from independent-city status to a town within Bedford County (51019) effective **July 1, 2013**. Not in the DMV county list; **no impact** on this project's FIPS set.
- All other DMV FIPS in the list above have been stable across the QCEW historical window relevant to the existing 2015-onward range used by `scripts/ingest/bls.ts:10`.
- Virginia's structural quirk: "all municipalities incorporated as cities are independent cities and are not part of any county." QCEW handles each Virginia independent city as its own area with its own 5-digit FIPS; some downstream products (notably **BEA**) recombine independent cities with their historical parent county, but QCEW does not.

## Comparison with adjacent BLS datasets

### Q14. QCEW vs. CES vs. LAUS
| Dimension | QCEW | CES (Current Employment Statistics) | LAUS (Local Area Unemployment Statistics) |
|---|---|---|---|
| What it counts | Filled jobs at place of **work**; UI-covered employment + UCFE federal workers | Nonfarm payroll jobs at place of work (sample-based) | Persons employed/unemployed at place of **residence** (modeled, replicates CPS) |
| Method | **Universe count** of UI/UCFE administrative records | Stratified sample survey of worksites | Non-survey hierarchy of model-based estimates anchored to CPS |
| Geography | National, state, MSA, county | Primarily national + state (and largest metros for some series) | National, state, county, MSA, many cities |
| Frequency | Quarterly | Monthly | Monthly |
| Lag | ~6 months after end of quarter | ~3 weeks after reference week | ~3 weeks after reference month |
| Excludes | Self-employed, unincorporated proprietors, unpaid family workers, certain farm/domestic workers, railroad workers under RUIA | Workers not covered by UI; small establishments outside sample frame | Models residence-based labor force; conceptually all workers but estimated rather than counted |
| Ownership detail | Federal/state/local/international/private — explicit | Government supersector, less detail at sub-state | Not industry-decomposed |

The repo currently ingests LAUS unemployment rate (`LAUCN<fips>0000000003`) per DMV county and a single MSA-level QCEW-style federal employment figure (`SMU11479009091000001`, MSA `47900` = Washington-Arlington-Alexandria) via the BLS API (`scripts/ingest/bls.ts:13–14, 51–66`). That `SMU…` series is from the State and Area Employment program (CES), not QCEW; it covers the full Washington metro and is not decomposable to county.

### Q15. FRED republication of QCEW county × federal-ownership
- FRED carries 7,714 series tagged `qcew` and 776 series tagged both `federal` and `qcew`. There are FRED series for individual counties (e.g., `Bland County, VA; QCEW`).
- FRED's BLS-derived series IDs follow the BLS structure (e.g., `ENU{fips}{datatype}{size}{ownership}{naics}`). The example surfaced in research is `ENU04013105111150` — a Maricopa County, AZ private-sector NAICS 111150 series.
- FRED does **not appear to publish a separate API/series naming convention beyond BLS's own**; it republishes the series IDs directly. Whether *every* county × federal-ownership × all-industries QCEW total is exposed as a discoverable FRED series (vs. only construction via direct BLS access) was not confirmed because `fred.stlouisfed.org` blocked direct fetch in this research session. *(Partially listed under Open Questions.)*

## Repository conventions

### Q16. Existing ingester pattern, type definitions, transform shape, plug-in point
- **DataSource interface** (`scripts/ingest/DataSource.ts:7-11`):
  ```ts
  interface DataSource {
    readonly name: string;
    readonly cadence: Cadence;
    fetch(): Promise<Observation[]>;
  }
  ```
- **Atomic type** (`shared/src/types.ts:59-67`):
  ```ts
  interface Observation {
    source: string;
    series: string;
    fips: string;
    metric: MetricId;
    observedAt: string;
    value: number;
    unit: Unit;
  }
  ```
  `Cadence` is `'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'` (`shared/src/types.ts:7`) — already includes `'quarterly'`.
- **Reference ingester:** `scripts/ingest/fred.ts` is called out in `CLAUDE.md` as the canonical pattern. `scripts/ingest/bls.ts` is the existing BLS implementation: builds a `Map<seriesID, SeriesMeta>` (`buildSeriesMeta` at `scripts/ingest/bls.ts:51`), batches them in one POST, parses with Zod (`BlsResponseSchema` at `:28`), warns on missing series, throws typed `IngestError` on failure.
- **Plug-in point:** Add a new file `scripts/ingest/qcew.ts` exporting a class `QcewSource implements DataSource`, register it in the source registry consumed by `scripts/ingest/run.ts`, add the new source name to the `SOURCES` tuple in `scripts/transform/build-county-pages.ts:46`, and provide a `cadenceFor` arm at `scripts/transform/build-county-pages.ts:109` returning `'quarterly'`.
- **Output shape:** `CountySummary` (`shared/src/types.ts:119-130`) is the per-county JSON written to `web/public/data/counties/{fips}.json`. It carries an open-ended `current` (`CountyCurrentSnapshot`) and `series` (`CountySeries`) — neither currently has a federal-employment field at the county level. Adding one requires editing `shared/src/types.ts` (per `CLAUDE.md`: "Never break `shared/types.ts` without updating both the scripts and the web consumer"). The web consumer reads via `web/src/api.ts`.

### Q17. Existing metric IDs and prior art for ownership-segmented employment
- `MetricId` union (`shared/src/types.ts:15-42`) currently includes: `fhfa_hpi`, `median_sale_price`, `median_list_price`, `median_price_per_sqft`, `zhvi_all_homes`, `zhvi_sfh`, `zhvi_condo`, `zori_rent`, `active_listings`, `new_listings`, `homes_sold`, `months_supply`, `days_on_market`, `sale_to_list_ratio`, `pct_sold_above_list`, `pct_price_drops`, `mortgage_30y_rate`, `mortgage_15y_rate`, `median_household_income`, `median_home_value`, `median_gross_rent`, `unemployment_rate`, **`federal_employment`**, `building_permits`, `hotness_score`, `hotness_rank`, `population`.
- `federal_employment` already exists as a metric ID. It is currently produced only at MSA scale (FIPS `'11-metro'`) by `BlsSource` consuming the CES series `SMU11479009091000001` (`scripts/ingest/bls.ts:13-14, 60-65`). There is **no county-level federal-employment series in the cache today**.
- `Unit` union includes `'count'` (`shared/src/types.ts:44-53`), already used for the existing federal-employment observations.
- Output prior art: `web/public/data/counties/11001.json` and the other 20 county JSONs include `current` snapshot fields (e.g., `unemploymentRate`) and `series` arrays (e.g., `fhfaHpi`). There is no existing `federalEmployment` field on either `CountyCurrentSnapshot` or `CountySeries`. The existing MSA-level federal-employment data is produced into the BLS cache but **does not** appear in `CountySummary` outputs (no field to surface it on a per-county page).
- **Metrics directory:** `web/public/data/metrics/` currently contains only `mortgage-rates.json`. The pattern for non-county-resolved series is a `MetricSeries` JSON keyed by metric (e.g., national mortgage rate). An MSA-level federal-employment series would naturally live here as well (e.g., `metrics/federal-employment-msa.json`) but does not today.

## Open Questions

1. **Q7 — Exact BLS attribution / redistribution language for QCEW.** The `bls.gov/bls/linksite.htm` page returned 403 Forbidden to automated fetch and the precise required citation text could not be quoted. General principle (federal works → public domain in the U.S., attribute to BLS) is well-established but the specific recommended attribution string is not captured here.
2. **Q15 (coverage portion) — Whether every DMV county × federal-ownership QCEW total is republished as a discoverable FRED series.** FRED's series catalog could not be queried directly (403). The BLS-API path is known to work for any FIPS; FRED republication is a convenience, not a dependency for this project.
3. **Q6 (rate-limit numbers portion) — Documented rate limits for the `data.bls.gov/cew/data/api/...` CSV slice endpoints.** Multiple sources confirm "no key required" and an empirical 336-fetch run completed without throttling, but BLS does not publish a specific request-rate ceiling.

## Next
**Phase:** Design
**Artifact to review:** `docs/crispy/qcew-federal-employment/2-research.md`
**Action:** Review research findings. Then invoke `crispy-design` with project name `qcew-federal-employment`.
