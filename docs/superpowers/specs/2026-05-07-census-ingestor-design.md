# Census ACS Ingestor Design

**Date:** 2026-05-07  
**Scope:** Implement `scripts/ingest/census.ts` (currently a stub) per PROJECT_SPEC step 9 and DATA_SOURCES.md §3.

---

## Goal

Fetch ACS 5-year demographic metrics for all 21 DMV county-equivalents and emit `Observation[]` compatible with the shared type contract. Three metrics in scope for v1: median household income, median home value, median gross rent.

---

## Architecture & Data Flow

**3 HTTP requests**, one per state group, using the Census wildcard syntax:

| Request | Query params | Rows returned |
|---|---|---|
| DC | `for=county:001&in=state:11` | 1 |
| MD | `for=county:*&in=state:24` | ~24 MD counties — filter to 9 DMV |
| VA | `for=county:*&in=state:51` | ~133 VA county-equivalents — filter to 11 DMV |

**Variables fetched in every request:**
```
get=NAME,B19013_001E,B25077_001E,B25064_001E,state,county
```

**ACS year:** hardcoded constant `ACS_YEAR = 2023`. Update this constant in a future PR when the 2024 vintage ships. DATA_SOURCES.md notes the 2024 release should be available as of December 2025.

**Census API base URL:** `https://api.census.gov/data/{ACS_YEAR}/acs/acs5`

**Response shape** (2D array, headers in row 0):
```json
[
  ["NAME", "B19013_001E", "B25077_001E", "B25064_001E", "state", "county"],
  ["Montgomery County, Maryland", "123456", "456789", "2100", "24", "031"],
  ...
]
```

Each (data row × variable) produces one `Observation`. `observedAt` is `"{ACS_YEAR}-01-01"`. `series` is the Census variable code (e.g., `"B19013_001E"`). `source` is `"census"`.

---

## Components & Interfaces

### Variable spec table

```ts
interface VariableSpec {
  variable: string;
  metric: MetricId;
  unit: Unit;
}

const VARIABLES: readonly VariableSpec[] = [
  { variable: 'B19013_001E', metric: 'median_household_income', unit: 'USD' },
  { variable: 'B25077_001E', metric: 'median_home_value',       unit: 'USD' },
  { variable: 'B25064_001E', metric: 'median_gross_rent',       unit: 'USD' },
];
```

All three MetricIds already exist in `shared/src/types.ts`. No type changes needed.

### Zod schema

```ts
const CensusResponseSchema = z.array(z.array(z.string().nullable()));
```

Validates the outer shape only. Per-cell logic (sentinel filtering, null checks, column count guard) lives in the exported `parseRows()` function.

### `parseRows(raw, dmvFipsSet)`

Pure function that takes the validated 2D array and a `Set<string>` of DMV FIPS codes. Returns `Observation[]`. Exported for unit testing without HTTP mocking (same pattern as `parseBlsResponse` in `bls.ts`).

Responsibilities:
- Extracts headers from row 0; derives column indices for each variable, `state`, and `county`
- Skips rows where the 5-digit FIPS (`state + county`) is not in the DMV set
- Skips individual cells where value is `null`, `"-666666666"`, or fails `Number.isFinite()`
- Logs `warn` for skipped cells (not skipped rows)

### `CensusSource` class

Implements `DataSource`:
- `name = 'census'`
- `cadence = 'annual'`
- `fetch()`:
  1. Reads `CENSUS_API_KEY` from env; throws `IngestError` if missing
  2. Builds the DMV FIPS `Set` from `DMV_COUNTIES`
  3. Runs 3 state queries sequentially; on per-state HTTP/parse failure logs `error` and continues
  4. Merges results, returns `Observation[]`

No rate-limit sleep needed — Census API has no documented per-request throttle with a key, and 3 requests is trivially small.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `CENSUS_API_KEY` not set | Throw `IngestError` before first request |
| HTTP error on a state query | Log `error`, skip that state's counties, continue |
| Zod parse failure | Throw `IngestError` wrapping the Zod error |
| Row with wrong column count | Log `warn`, skip row |
| Cell value is sentinel or null | Log `warn`, skip that observation |
| Non-DMV county row | Skip silently (expected for MD/VA wildcard) |

---

## Testing (`scripts/ingest/census.test.ts`)

All tests call `parseRows()` directly — no HTTP mocking required.

| Test case | What it verifies |
|---|---|
| Valid fixture response | Correct `Observation[]` for all 3 metrics |
| Sentinel `"-666666666"` cell | Observation filtered, others in same row kept |
| `null` cell | Observation filtered |
| Non-DMV county row | Row filtered, not thrown |
| Malformed row (wrong column count) | Warn + skip, no throw |

---

## Files Changed

| File | Change |
|---|---|
| `scripts/ingest/census.ts` | Replace stub with full implementation |
| `scripts/ingest/census.test.ts` | New file — `parseRows()` unit tests |
| `DATA_SOURCES.md` | Note ACS_YEAR = 2023; flag 2024 update available |

No changes to `shared/src/types.ts`, `run.ts`, or any other file.
