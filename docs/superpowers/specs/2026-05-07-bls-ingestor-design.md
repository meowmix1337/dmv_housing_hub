# BLS Ingestor — Design Spec

**Date:** 2026-05-07
**Status:** Approved
**Scope:** `scripts/ingest/bls.ts` (replace stub) + `scripts/ingest/bls.test.ts` (new)

---

## Goal

Implement the BLS (Bureau of Labor Statistics) ingester to pull:
1. **LAUS county unemployment rates** for all 21 DMV jurisdictions
2. **CES MSA federal employment** for the Washington-Arlington-Alexandria metro area

This is step 9 of `PROJECT_SPEC.md`, following the `DataSource` interface pattern established by the FRED ingester.

---

## Architecture

### Files

| File | Action |
|---|---|
| `scripts/ingest/bls.ts` | Replace stub with full implementation |
| `scripts/ingest/bls.test.ts` | New — vitest unit tests for parsing logic |

No other files change. `run.ts` already imports and registers `BlsSource`.

### Data flow

```
BlsSource.fetch()
  → validate BLS_API_KEY env var (throw IngestError if missing)
  → build 22 series IDs
      21 × LAUCN{FIPS}0000000003   (LAUS county unemployment rate)
      1  × SMU11479009091000001     (Washington-Arlington-Alexandria MSA federal employment)
  → POST https://api.bls.gov/publicAPI/v2/timeseries/data/
      body: { seriesid: [...22], startyear: "2015", endyear: "2026", registrationkey: KEY }
  → Zod-validate response
  → for each series in response.Results.series:
      resolve fips + metric from seriesID
      for each data point:
        skip period === "M13" (annual average)
        skip value that is not a finite number or is "-"
        convert { year, period } → observedAt: "YYYY-MM-01"
        emit Observation
  → return Observation[]
```

### Series ID → metadata mapping

| Series ID | FIPS | metric | unit |
|---|---|---|---|
| `LAUCN{FIPS}0000000003` | 5-digit county FIPS (stripped from series ID) | `unemployment_rate` | `percent` |
| `SMU11479009091000001` | `"11-metro"` (MSA sentinel) | `federal_employment` | `count` |

The FIPS for LAUS is recovered by stripping the `LAUCN` prefix (5 chars) and `0000000003` suffix (10 chars), leaving the 5-digit FIPS.

### HTTP

Uses `fetchWithRetry` from `../lib/http.js` with `method: "POST"` and `Content-Type: application/json` passed via the `headers` option. The existing `fetchJson` helper only wraps GET; the BLS call will use `fetchWithRetry` directly and parse the response JSON inline, matching how a POST is handled without adding a new helper.

---

## Zod Response Schema

```ts
const BlsDataPointSchema = z.object({
  year: z.string(),
  period: z.string(),   // "M01"–"M13"
  value: z.string(),
  footnotes: z.array(z.unknown()).optional(),
});

const BlsSeriesSchema = z.object({
  seriesID: z.string(),
  data: z.array(BlsDataPointSchema),
});

const BlsResponseSchema = z.object({
  status: z.string(),
  message: z.array(z.string()).optional(),
  Results: z.object({
    series: z.array(BlsSeriesSchema),
  }).optional(),
});
```

If `status !== "REQUEST_SUCCEEDED"`, throw `IngestError` with the `message` array joined as context.

---

## Parsing Rules

### `periodToIso(year: string, period: string): string | null`

- `period === "M13"` → return `null` (caller skips)
- Otherwise: strip `"M"` prefix, zero-pad month, return `"${year}-${month}-01"`
- Export this function so tests can call it directly

### Missing / invalid values

- `value === "-"` → skip (BLS sentinel for suppressed data)
- `!Number.isFinite(Number(value))` → skip
- No `warn` log for individual skipped points — expected, not anomalous

### Series missing from response

BLS silently omits series it doesn't recognise. After parsing, log `warn` for any series ID that was requested but not present in the response. Do not throw — partial results are acceptable.

---

## Error Handling

| Condition | Action |
|---|---|
| `BLS_API_KEY` not set | `throw IngestError('BLS_API_KEY not set in environment', { source: 'bls' })` |
| HTTP non-2xx after retries | `HttpError` bubbles from `fetchWithRetry` |
| `status !== "REQUEST_SUCCEEDED"` | `throw IngestError(message, { source: 'bls' })` |
| Series absent from response | `log.warn(...)` and continue |
| Individual invalid data point | skip silently |

---

## Test Coverage (`bls.test.ts`)

| Test | What it verifies |
|---|---|
| `periodToIso("2024", "M03")` | returns `"2024-03-01"` |
| `periodToIso("2024", "M13")` | returns `null` |
| `periodToIso("2024", "M12")` | returns `"2024-12-01"` |
| Fixture: 2-series BLS response | correct `Observation[]` count, `fips`, `metric`, `value`, `observedAt` |
| Fixture: `value: "-"` | observation skipped |
| Fixture: `status: "REQUEST_FAILED"` | throws `IngestError` |

Parsing helpers are exported from `bls.ts` for direct testing without HTTP mocking.

---

## Constraints

- BLS API rate limit: 500 queries/day with key — one run costs 1 query
- Max 50 series per batch with key — 22 series fits comfortably in one request
- `startyear: "2015"`, `endyear: "2026"` — matches the stub's documented range; provides ~11 years of history for trend charts
- No `console.log` in production paths — use `log` from `../lib/log.js`
- No `any`, no non-null assertions — strict TypeScript throughout
