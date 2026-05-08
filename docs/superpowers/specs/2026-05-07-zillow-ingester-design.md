# Zillow Ingester Design

**Date:** 2026-05-07  
**Status:** Approved  

---

## Overview

Implement `ZillowSource` in `scripts/ingest/zillow.ts` to download ZHVI (typical home value) and ZORI (rent index) CSVs from Zillow Research and transpose them from wide to long `Observation[]` format.

---

## Scope

5 files: 4 county-level + 1 metro-level. No zip-level for v1.

| File | Metric | Scope |
|---|---|---|
| `County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv` | `zhvi_all_homes` | county |
| `County_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv` | `zhvi_sfh` | county |
| `County_zhvi_uc_condo_tier_0.33_0.67_sm_sa_month.csv` | `zhvi_condo` | county |
| `County_zori_uc_sfrcondomfr_sm_sa_month.csv` | `zori_rent` | county |
| `Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv` | `zhvi_all_homes` | metro |

All hosted at `https://files.zillowstatic.com/research/public_csvs/zhvi/` and `…/zori/`. URLs are hardcoded; if Zillow returns 404, the run log flags it and the file is skipped (no abort).

No auth required. No env vars needed.

---

## Architecture

### `FileSpec` interface

```ts
interface FileSpec {
  url: string;
  metric: MetricId;
  unit: Unit;
  scope: 'county' | 'metro';
}
```

A `FILES` constant declares all 5 specs.

### `buildFipsIndex(): ReadonlyMap<string, string>`

Builds a normalized county-name → FIPS map from `DMV_COUNTIES`:

- Primary key: `county.name.toLowerCase()` (e.g. `"montgomery county"`)
- DC: `"district of columbia"` → `"11001"`
- Independent VA cities: for any name ending in `" city"`, add a second entry with that suffix stripped (e.g. `"alexandria city"` → also keyed as `"alexandria"`)
- Also strip `" (city)"` suffix variant (case-normalized to lowercase before comparison) as noted in DATA_SOURCES.md

### `parseRow(row, spec, fipsIndex): Observation[]`

Takes one parsed CSV row (already keyed by column name), a `FileSpec`, and the index. Returns zero or more observations.

**County scope:**
1. Skip if `StateName` not in `{"District of Columbia", "Maryland", "Virginia"}`
2. Resolve `RegionName.toLowerCase()` → FIPS; `log.debug` and return `[]` if not found
3. Series: `zillow:county:{metric}` (e.g. `"zillow:county:zhvi_all_homes"`)

**Metro scope:**
1. Skip unless `RegionName === "Washington, DC"`
2. Hardcode fips `"47900"` (OMB MSA code for Washington-Arlington-Alexandria)
3. Series: `"zillow:metro:zhvi_all_homes"`

**Date column iteration (both scopes):**
- Iterate all column keys matching `/^\d{4}-\d{2}-\d{2}$/`
- Parse value as `Number`; skip if blank, empty string, or `!Number.isFinite`
- Emit one `Observation` per valid date column

### `ZillowSource.fetch(): Promise<Observation[]>`

```
build fipsIndex once
for each FileSpec (sequential):
  fetchWithRetry(url, { timeoutMs: 120_000 })
    on error → log.error + continue (skip file, don't abort)
  response.text() + csv-parse (sync, columns: true)
  for each row → parseRow → push observations
  log.info file summary
return all observations
```

Zillow county CSVs are plain (no gzip), ~2–5 MB each — `response.text()` + synchronous parse is sufficient. No streaming pipeline needed (contrast with Redfin's 7M-row gzipped TSV).

---

## Data flow

```
fetchWithRetry(url)
  → response.text()
  → csv-parse (columns: true)
  → parseRow(row, spec, fipsIndex)[]
  → Observation[]
  → scripts/.cache/zillow.json
```

---

## Error handling

- Missing/blank value in a date column: skip silently (normal — early months are sparse)
- `RegionName` not in FIPS index: `log.debug` (expected — Zillow files include non-DMV counties)
- HTTP error on a file: `log.error` + skip file; other files still run
- All files fail: `fetch()` returns `[]`; `run.ts` logs warn for zero observations

---

## Testing (`zillow.test.ts`)

Unit tests only — no network calls.

**`buildFipsIndex`:**
- Returns map with 21 entries
- `"montgomery county"` → `"24031"`
- `"district of columbia"` → `"11001"`
- `"alexandria"` → `"51510"` (stripped suffix)
- `"alexandria city"` → `"51510"` (full name)

**`parseRow` — county scope:**
- Skips rows with out-of-DMV `StateName`
- Skips and returns `[]` for unrecognized `RegionName`
- Returns correct `Observation[]` for a valid row: 3 date columns (1 blank, 2 valid) → 2 observations
- Correct `source`, `series`, `fips`, `metric`, `unit`, `observedAt`, `value`

**`parseRow` — metro scope:**
- Skips non-DC metro rows (e.g. `"Chicago, IL"`)
- Matches `"Washington, DC"` → fips `"47900"`, series `"zillow:metro:zhvi_all_homes"`

---

## Decisions log

| Decision | Rationale |
|---|---|
| Hardcoded URLs (not scrape-and-discover) | Simpler; 404s surface immediately in logs |
| County + metro (no zip) | Zip files are larger and zip-FIPS mapping is out of scope for v1 |
| MSA FIPS `"47900"` for metro | Standards-based OMB identifier; enables future cross-source joins (e.g. Case-Shiller WDXRSA) |
| Sequential file downloads | No published Zillow rate limit; parallel risks throttling; files are small so wall-clock cost is negligible |
| `response.text()` + sync parse | Files are ~2–5 MB plain CSV; streaming pipeline not needed (contrast: Redfin is 7M-row gzipped TSV) |
