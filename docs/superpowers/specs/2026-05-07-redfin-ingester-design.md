# Redfin Ingester Design

**Date**: 2026-05-07
**Status**: Approved
**Implements**: `scripts/ingest/redfin.ts` (currently a stub)
**Reference**: `DATA_SOURCES.md §6`, `PROJECT_SPEC.md step 9`

---

## Overview

Implement `RedfinSource` to download and parse the Redfin Data Center county market tracker TSV, filtering to DMV counties and emitting `Observation[]` for all mapped metrics. The file is large (~7M rows nationally) so the ingester uses a full Node.js streaming pipeline to keep memory bounded.

---

## Architecture & Data Flow

### Download

`fetchWithRetry` (existing `scripts/lib/http.ts`) fetches:

```
https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz
```

The response body (`ReadableStream<Uint8Array>`) is converted to a Node.js `Readable` via `Readable.fromWeb()`, piped through `zlib.createGunzip()`, then through `csv-parse({ delimiter: '\t', columns: true, skip_empty_lines: true })`. The pipeline is wired with `stream.pipeline()` so any stage error propagates cleanly.

### Row Filtering

Each parsed row is dropped if any of these conditions hold:

1. `state_code` not in `{'DC', 'MD', 'VA'}`
2. `region_type` not `'county'`
3. `period_duration` not `'7'` (weekly only for v1)
4. County name cannot be resolved to a FIPS in `DMV_COUNTIES`

### FIPS Resolution

Redfin's `region` column is formatted as `"Montgomery County, MD"`. The ingester strips the trailing `, {state_code}` suffix to get the bare county name, then does a case-insensitive match against `DMV_COUNTIES[].name`. Independent VA cities appear as `"Alexandria city, VA"` — the match covers lowercase `city` suffix naturally since `DMV_COUNTIES` uses that casing. Unresolved counties are logged at `warn` (with `region` and `state_code`) and skipped.

### Observation Construction

For each passing row × each mapped column: if the cell value is non-empty and parses to a finite number, emit one `Observation`:

- `source`: `'redfin'`
- `series`: `redfin:county:{property_type_slug}` (see encoding below)
- `fips`: resolved from county name + state_code
- `metric`: from `COLUMN_MAP`
- `observedAt`: `period_end` from the row (ISO date string)
- `value`: parsed float
- `unit`: from `COLUMN_MAP`

---

## Metric Mapping

`COLUMN_MAP` in `redfin.ts` maps Redfin column names to `MetricId` + `Unit`:

| Redfin column | MetricId | Unit |
|---|---|---|
| `median_sale_price` | `median_sale_price` | `USD` |
| `median_list_price` | `median_list_price` | `USD` |
| `median_ppsf` | `median_price_per_sqft` | `USD_per_sqft` |
| `homes_sold` | `homes_sold` | `count` |
| `new_listings` | `new_listings` | `count` |
| `inventory` | `active_listings` | `count` |
| `months_of_supply` | `months_supply` | `months` |
| `median_dom` | `days_on_market` | `days` |
| `avg_sale_to_list` | `sale_to_list_ratio` | `ratio` |
| `sold_above_list` | `pct_sold_above_list` | `percent` |
| `price_drops` | `pct_price_drops` | `percent` |

**Normalization:**
- `avg_sale_to_list` is already a ratio (e.g. `1.012`); stored as-is
- `sold_above_list` and `price_drops` are decimals (e.g. `0.027` = 2.7%); stored as-is with unit `percent` — the frontend multiplies by 100 for display, consistent with how BLS unemployment is stored

Columns with no mapping (`pending_sales`, `off_market_in_two_weeks`, etc.) are ignored. They can be added to `shared/src/types.ts` in a future PR.

---

## Series Field Encoding

```
redfin:county:{property_type_slug}
```

| Redfin `property_type` | slug |
|---|---|
| `All Residential` | `all_residential` |
| `Single Family Residential` | `single_family` |
| `Condo/Co-op` | `condo` |
| `Townhouse` | `townhouse` |

Unknown property types: `log.warn` + skip (forward-compatible if Redfin adds types).

---

## Error Handling

| Scenario | Behavior |
|---|---|
| HTTP error | `fetchWithRetry` retries; non-2xx throws `HttpError` → re-thrown as `IngestError` |
| Stream/gunzip error | caught by `stream.pipeline()`, re-thrown as `IngestError` |
| Malformed row (bad date, non-numeric value) | `log.debug` + skip row; never throw on a single bad row |
| FIPS miss | `log.warn({ region, state_code })` + skip row |
| Zero rows pass filter | `log.warn` + return `[]`; does not throw |

---

## Code Structure

The row-parsing logic is extracted into a pure function for testability:

```ts
function parseRow(
  row: Record<string, string>,
  fipsIndex: ReadonlyMap<string, string>,
): Observation[]
```

`RedfinSource.fetch()` sets up the stream pipeline and calls `parseRow` for each passing row. This keeps I/O and parsing separated and lets tests drive `parseRow` directly without mocking `fetch`.

---

## Tests (`redfin.test.ts`)

Four fixture rows covering:

1. **Happy path** — weekly `All Residential` row for Montgomery County, MD → correct FIPS (`24031`), correct observations for all mapped columns
2. **Monthly filtered out** — same row with `period_duration = 30` → zero observations
3. **Out-of-DMV filtered out** — row with `state_code = 'CA'` → zero observations
4. **Independent city** — `"Alexandria city, VA"` row → resolves to FIPS `51510`

---

## What Is Not Changing

- `shared/src/types.ts` — all required `MetricId` and `Unit` values already exist
- `scripts/ingest/run.ts` — `RedfinSource` is already registered
- `scripts/transform/build-county-pages.ts` — already reads from `redfin.json` cache and uses the relevant metrics

---

## Citation

Per Redfin's data license, every chart or metric sourced from Redfin must display:

> "Source: Redfin Data Center, accessed YYYY-MM-DD"

The `source: 'redfin'` field on every `Observation` carries this forward to the frontend.
