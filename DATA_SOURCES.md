# Data Sources Reference

Ground truth for the ingestion layer. Every ingester implementation must match this document. If a source's behavior changes upstream, update this doc in the same PR.

---

## 1. FRED (Federal Reserve Economic Data) — primary backbone

**Why we use it**: Single API, county-level coverage, mirrors many other sources (FHFA, Realtor.com, Zillow). Free, no rate-limit pain.

- **Base URL**: `https://api.stlouisfed.org/fred/`
- **Auth**: Free API key via email signup at https://fred.stlouisfed.org/docs/api/api_key.html
- **Rate limit**: 120 req/min per key
- **Format**: JSON or XML (always request `file_type=json`)
- **Cadence varies by series**: weekly to annual

### Series we ingest

| Series ID pattern | Description | Cadence |
|---|---|---|
| `ATNHPIUS{FIPS}A` | FHFA all-transactions HPI, county, annual, 1975+ | annual |
| `MORTGAGE30US` | Freddie Mac 30-yr fixed mortgage rate | weekly |
| `MORTGAGE15US` | Freddie Mac 15-yr fixed | weekly |
| `MDSTHPI`, `VASTHPI`, `DCSTHPI` | FHFA state HPI | quarterly |
| `WDXRSA` | Case-Shiller DC metro HPI | monthly |
| `HOSCCOUNTY{FIPS}` | Realtor.com hotness score | monthly |
| `HORAMMCOUNTY{FIPS}` | Realtor.com hotness rank | monthly |
| `MELIPRCOUNTY{FIPS}` | Realtor.com median listing price | monthly |
| `LDPEPRVSUSCOUNTY{FIPS}` | Realtor.com page views vs U.S. | monthly |
| `PERMIT` | National building permits (national) | monthly |

### Endpoint

```
GET /fred/series/observations?series_id={id}&api_key={KEY}&file_type=json
```

### Response shape

```json
{
  "realtime_start": "2026-05-07",
  "realtime_end": "2026-05-07",
  "observations": [
    { "realtime_start": "...", "realtime_end": "...", "date": "2024-01-01", "value": "267.45" },
    ...
  ]
}
```

### Gotchas

- Missing values come as `"."` not null. Ingester must filter or handle.
- `value` is always a string — parse to number.
- For county-level FHFA HPI, the `A` suffix means annual; some counties have additional `Q` (quarterly) or `M` series. Stick to `A` for v1.
- Series search: `GET /fred/series/search?search_text={text}&api_key={KEY}&file_type=json`

---

## 2. Freddie Mac Primary Mortgage Market Survey (PMMS)

**Why we use it**: Authoritative weekly mortgage rate. No key needed.

- **URL**: `https://www.freddiemac.com/pmms/docs/PMMS_history.csv`
- **Auth**: None
- **Cadence**: weekly, published Thursdays ~10am ET
- **Format**: CSV
- **Columns**: `Week`, `30YR_FRM`, `30YR_FRM_Avg_Pts`, `15YR_FRM`, `15YR_FRM_Avg_Pts`, ... (history back to 1971)

### Notes

- Already mirrored in FRED as `MORTGAGE30US`/`MORTGAGE15US`. **Prefer the FRED ingester** to avoid two paths to the same data — but if FRED is down, this is the fallback.
- For v1 just use FRED. Implement this ingester only as a backup.

---

## 3. US Census Bureau — ACS 5-year + Building Permits

**Why we use it**: Demographic context (income, home value, rent), supply pipeline.

- **Base URL**: `https://api.census.gov/data/{year}/acs/acs5`
- **Auth**: Free key from https://api.census.gov/data/key_signup.html
- **Cadence**: annual (5-year ACS released every December for prior year)
- **Format**: JSON (returns a 2D array — first row is headers)

### Tables we ingest

| Table | Description |
|---|---|
| `B19013_001E` | Median household income |
| `B25077_001E` | Median home value |
| `B25064_001E` | Median gross rent |
| `B25024_001E` | Total housing units |
| `B25034` | Year structure built (10 columns) |

### Endpoint example

```
GET /data/2023/acs/acs5?get=NAME,B19013_001E,B25077_001E,B25064_001E&for=county:031&in=state:24&key={KEY}
```

For DMV: loop over the FIPS list, breaking into state+county pairs (state 11 for DC, 24 for MD, 51 for VA).

### Gotchas

- DC is queried as `for=county:001&in=state:11` (single county-equivalent).
- Independent VA cities are county-equivalents — same query pattern.
- Use the latest ACS year available (currently 2023 5-year). Check yearly for new release in December.

---

## 4. BLS — county unemployment + federal employment

**Why we use it**: Unemployment as economic-health signal; federal employment is the killer DMV-specific metric.

- **Base URL**: `https://api.bls.gov/publicAPI/v2/timeseries/data/`
- **Auth**: Free key from https://data.bls.gov/registrationEngine/
- **Rate limit**: 500 queries/day with key (25 without)
- **Cadence**: monthly
- **Format**: JSON, POST request

### Series IDs

- LAUS (Local Area Unemployment Statistics): `LAUCN{FIPS}0000000003` — county unemployment rate
  - e.g. `LAUCN240310000000003` for Montgomery County
- CES (Current Employment Statistics) federal government: `CES9091000001` — Federal employment, seasonally adjusted
- For DMV metro federal: `SMU11479009091000001` (Washington-Arlington-Alexandria MSA, federal government)

### Endpoint

```
POST /publicAPI/v2/timeseries/data/
Content-Type: application/json

{
  "seriesid": ["LAUCN240310000000003", "LAUCN510590000000003"],
  "startyear": "2015",
  "endyear": "2026",
  "registrationkey": "{KEY}"
}
```

### Gotchas

- Up to 50 series per request with key (25 without).
- BLS returns `period` like `M01`, `M02` — convert to ISO date assuming first of month.
- Some series have `M13` = annual average. Filter these out.

---

## 5. Zillow Research — ZHVI, ZORI

**Why we use it**: ZHVI is the smoothed "typical home value" — better than median sale price for trend lines. ZORI is the rent equivalent.

- **Base URL**: `https://www.zillow.com/research/data/` → public CSV downloads
- **Auth**: None
- **Cadence**: monthly
- **Format**: CSV (wide format — one row per geography, one column per month)

### Files we ingest

| File | Description |
|---|---|
| `Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv` | ZHVI all-homes mid-tier, smoothed, seasonally adjusted, metro |
| `County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv` | Same, county |
| `County_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv` | SFH only |
| `County_zhvi_uc_condo_tier_0.33_0.67_sm_sa_month.csv` | Condo/co-op |
| `Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv` | ZIP-level (bigger file) |
| `County_zori_uc_sfrcondomfr_sm_sa_month.csv` | ZORI rent index, county |

### URL pattern

URLs are documented at https://www.zillow.com/research/data/ but Zillow notes paths change. Best practice: scrape the data page on first run to discover the canonical URL, cache it, retry-with-rediscovery on 404.

### Gotchas

- **Wide format**: ingester must transpose to long form (one row per (fips, date, value)).
- Geography column: `RegionID` (Zillow internal), `RegionName` (county name), `StateName` (state). Filter by state to "DC", "MD", "VA". Then resolve `RegionName` → FIPS via a lookup table — Zillow doesn't include FIPS.
- Zillow uses idiosyncratic names: "Prince George's County" matches; "DC" is just `RegionName="District of Columbia"`.
- Independent VA cities appear with " (City)" suffix in some files.

---

## 6. Redfin Data Center

**Why we use it**: Richest free source for current weekly market pulse — price, $/sqft, days on market, inventory, % above list, sale-to-list, % price drops.

- **Base URL**: `https://www.redfin.com/news/data-center/`
- **Auth**: None
- **Cadence**: weekly (updated Wednesdays for prior week) and monthly (third Friday)
- **Format**: TSV gzipped

### Files we ingest

URLs visible on the Data Center page; right-click "Download" link to get static URL. Pattern:

```
https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz
https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/zip_code_market_tracker.tsv000.gz
```

### Columns of interest

`period_begin`, `period_end`, `period_duration`, `region_type`, `region_type_id`, `table_id`, `is_seasonally_adjusted`, `region`, `city`, `state`, `state_code`, `property_type`, `property_type_id`, `median_sale_price`, `median_list_price`, `median_ppsf`, `median_list_ppsf`, `homes_sold`, `pending_sales`, `new_listings`, `inventory`, `months_of_supply`, `median_dom`, `avg_sale_to_list`, `sold_above_list`, `price_drops`, `off_market_in_two_weeks`

### Gotchas

- File is large (~7M rows nationally). Filter by `state_code IN ('DC', 'MD', 'VA')` immediately on parse to keep memory bounded.
- Multiple `property_type` rows per (region, period) — "All Residential", "Single Family Residential", "Condo/Co-op", "Townhouse". Keep all but tag clearly.
- `period_duration` is in days. Weekly = 7, monthly = 30. We typically want weekly + monthly separately.
- Some columns are formatted as percentages without `%` sign (e.g., `0.027` = 2.7%). Document and normalize.
- Redfin can revise prior-week numbers — ingester should overwrite, not append.
- Cite Redfin and link back; required by their data license.

---

## 7. FHFA HPI (House Price Index)

**Why we use it**: Long-run county appreciation history (1975+).

- **Base URL**: `https://www.fhfa.gov/DataTools/Downloads/Pages/House-Price-Index-Datasets.aspx`
- **Auth**: None
- **Cadence**: quarterly (state, MSA), annual (county)
- **Format**: CSV

### Files

- `HPI_AT_BDL_county.csv` — annual county HPI back to 1975
- `HPI_PO_state.csv` — purchase-only state quarterly
- `HPI_AT_BDL_MSA.csv` — annual MSA

### Notes

- Already in FRED via `ATNHPIUS{FIPS}A`. Prefer FRED ingester. Use the direct FHFA CSV only if you need a metric FRED doesn't mirror.

---

## 8. HUD User — Fair Market Rents, Income Limits

**Why we use it**: Affordability segmentation against HUD AMI bands.

- **Base URL**: `https://www.huduser.gov/hudapi/public/`
- **Auth**: Free key at https://www.huduser.gov/portal/dataset/fmr-api.html
- **Cadence**: annual

### Endpoints

- `/fmr/data/{year}` — Fair Market Rents
- `/il/data/{year}` — Income Limits

Defer to v2 unless affordability page needs it for v1.

---

## 9. Realtor.com (via FRED mirror)

Already covered under FRED. No separate ingester needed for v1. Realtor.com publishes ~26,000 series mirrored on FRED with prefixes like `HOSCCOUNTY`, `MELIPRCOUNTY`, etc.

---

## 10. Bright MLS (regional MLS)

**Why we'd want it**: Authoritative DMV-specific commentary and contract ratios.

- **Public reports**: `https://www.brightmls.com/marketreports` — PDFs, scrape if needed.
- **RESO Web API**: requires brokerage/vendor MLS subscription. Out of scope for v1.

For v1: skip. Bright MLS commentary can be hand-curated as static `forecasts.json` initially, with monthly manual updates from the published PDF reports.

---

## 11. First Street Foundation (climate risk)

**Why we'd want it**: Climate risk overlays.

- Public lookups at https://firststreet.org are property-level and don't expose a free aggregate API.
- Skip for v1. Re-evaluate in v2.

---

## Source priority for v1 ingest

Build in this order:

1. **FRED** — covers FHFA HPI, mortgage rates, Realtor.com hotness for every county. Single ingester unlocks 60% of charts.
2. **Census ACS** — demographics underpin affordability calculations. Annual cadence, low complexity.
3. **BLS** — unemployment + federal employment. Federal employment is the differentiator.
4. **Zillow** — ZHVI for the smoothed price line. CSV parsing and FIPS lookup table is the only friction.
5. **Redfin** — defer to last because the TSV is large and the parsing is the most involved. v1 can ship without it; v1.1 adds it.

---

## What goes into `web/public/data/`

After all ingesters run, `scripts/transform/build-county-pages.ts` produces:

```
web/public/data/
├── manifest.json                     # source freshness
├── counties/
│   ├── 11001.json                    # CountySummary
│   ├── 24031.json
│   └── ... (21 files)
├── metrics/
│   ├── mortgage-rates.json           # MetricSeries (national)
│   ├── case-shiller-dc.json          # MetricSeries (metro)
│   └── ...
└── geo/
    └── dmv-counties.geojson
```

Each county JSON is self-contained — the County page makes one fetch and renders.

---

## Citation requirements

Every chart and metric on the site must show its source in a small footer or tooltip. Examples:

- "Source: U.S. Federal Reserve Bank of St. Louis (FRED), series ATNHPIUS24031A"
- "Source: Redfin Data Center, accessed YYYY-MM-DD"
- "Source: Zillow Research"
- "Source: U.S. Census Bureau, ACS 5-year 2023"
- "Source: Bureau of Labor Statistics, LAUS"

The `Observation` type carries `source` and `series` precisely for this. Do not strip them in transforms.
