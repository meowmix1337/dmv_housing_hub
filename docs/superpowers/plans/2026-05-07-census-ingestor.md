# Census ACS Ingestor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `CensusSource` stub in `scripts/ingest/census.ts` with a working ACS 5-year ingestor that emits `Observation[]` for median household income, median home value, and median gross rent for all 21 DMV county-equivalents.

**Architecture:** Three HTTP requests (one per state: DC, MD, VA) using the Census wildcard `for=county:*` pattern; MD and VA responses are filtered to DMV FIPS. A pure `parseRows()` function handles all data transformation and is exported for unit testing without mocking HTTP. `CensusSource.fetch()` is the thin orchestrator.

**Tech Stack:** TypeScript (strict), Zod for response validation, `fetchJson` from `scripts/lib/http.ts`, `DMV_COUNTIES` from `scripts/lib/counties.ts`, Vitest for tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/ingest/census.ts` | Modify (replace stub) | Full implementation: constants, schema, `parseRows`, `CensusSource` |
| `scripts/ingest/census.test.ts` | Create | Unit tests for `parseRows` |
| `DATA_SOURCES.md` | Modify | Note ACS_YEAR = 2023; flag 2024 update |

---

## Task 1: Write the failing tests

**Files:**
- Create: `scripts/ingest/census.test.ts`

- [ ] **Step 1.1: Create the test file**

```ts
// scripts/ingest/census.test.ts
import { describe, it, expect } from 'vitest';
import { parseRows } from './census.js';

const DMV_FIPS_SET = new Set(['11001', '24031', '24033', '51013']);

const VALID_FIXTURE: (string | null)[][] = [
  ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
  ['Montgomery County, Maryland', '120000', '550000', '1800', '24', '031'],
  ['District of Columbia', '95000', '680000', '1600', '11', '001'],
];

describe('parseRows', () => {
  it('returns correct observations for a valid fixture', () => {
    const result = parseRows(VALID_FIXTURE, DMV_FIPS_SET);
    // 2 counties × 3 variables = 6 observations
    expect(result).toHaveLength(6);

    const mc = result.find((o) => o.fips === '24031' && o.metric === 'median_household_income');
    expect(mc).toBeDefined();
    expect(mc!.value).toBe(120000);
    expect(mc!.unit).toBe('USD');
    expect(mc!.source).toBe('census');
    expect(mc!.series).toBe('B19013_001E');
    expect(mc!.observedAt).toBe('2023-01-01');
  });

  it('filters sentinel "-666666666" cells and keeps other cells in the same row', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
      ['Montgomery County, Maryland', '-666666666', '550000', '1800', '24', '031'],
    ];
    const result = parseRows(fixture, DMV_FIPS_SET);
    expect(result).toHaveLength(2); // B25077 + B25064 only
    expect(result.find((o) => o.metric === 'median_household_income')).toBeUndefined();
    expect(result.find((o) => o.metric === 'median_home_value')).toBeDefined();
  });

  it('filters null cells and keeps other cells in the same row', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
      ['Montgomery County, Maryland', null, '550000', '1800', '24', '031'],
    ];
    const result = parseRows(fixture, DMV_FIPS_SET);
    expect(result).toHaveLength(2);
    expect(result.find((o) => o.metric === 'median_household_income')).toBeUndefined();
  });

  it('silently skips non-DMV county rows', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
      ['Some Other County, Maryland', '80000', '300000', '1200', '24', '999'],
      ['Montgomery County, Maryland', '120000', '550000', '1800', '24', '031'],
    ];
    const result = parseRows(fixture, DMV_FIPS_SET);
    expect(result).toHaveLength(3); // Montgomery only (3 variables)
    expect(result.every((o) => o.fips === '24031')).toBe(true);
  });

  it('warns and skips malformed rows without throwing', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
      ['bad'], // too few columns
      ['Montgomery County, Maryland', '120000', '550000', '1800', '24', '031'],
    ];
    expect(() => parseRows(fixture, DMV_FIPS_SET)).not.toThrow();
    const result = parseRows(fixture, DMV_FIPS_SET);
    expect(result).toHaveLength(3); // Montgomery only
  });

  it('returns an empty array when the response has no data rows', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
    ];
    expect(parseRows(fixture, DMV_FIPS_SET)).toHaveLength(0);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
npx vitest run scripts/ingest/census.test.ts
```

Expected: fail with `SyntaxError` or `does not provide an export named 'parseRows'` — the stub doesn't export it yet. This confirms the test is wired up correctly.

- [ ] **Step 1.3: Commit the failing tests**

```bash
git add scripts/ingest/census.test.ts
git commit -m "test: add failing unit tests for census parseRows"
```

---

## Task 2: Implement `parseRows`

**Files:**
- Modify: `scripts/ingest/census.ts`

- [ ] **Step 2.1: Replace the stub with the full file**

Replace the entire contents of `scripts/ingest/census.ts` with:

```ts
import { z } from 'zod';
import type { MetricId, Observation, Unit } from '@dmv/shared';
import { fetchJson } from '../lib/http.js';
import { log } from '../lib/log.js';
import { IngestError } from '../lib/errors.js';
import { DMV_COUNTIES } from '../lib/counties.js';
import type { DataSource } from './DataSource.js';

const ACS_YEAR = 2023;
const BASE_URL = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5`;
const OBSERVED_AT = `${ACS_YEAR}-01-01`;
const SENTINEL = '-666666666';

interface VariableSpec {
  variable: string;
  metric: MetricId;
  unit: Unit;
}

const VARIABLES: readonly VariableSpec[] = [
  { variable: 'B19013_001E', metric: 'median_household_income', unit: 'USD' },
  { variable: 'B25077_001E', metric: 'median_home_value', unit: 'USD' },
  { variable: 'B25064_001E', metric: 'median_gross_rent', unit: 'USD' },
];

const CensusResponseSchema = z.array(z.array(z.string().nullable()));

function getApiKey(): string {
  const key = process.env.CENSUS_API_KEY;
  if (!key) {
    throw new IngestError('CENSUS_API_KEY not set in environment', { source: 'census' });
  }
  return key;
}

function buildDmvFipsSet(): Set<string> {
  return new Set(DMV_COUNTIES.map((c) => c.fips));
}

/**
 * Parse a raw Census ACS 2D-array response into Observations.
 * Exported for unit testing without HTTP mocking.
 */
export function parseRows(raw: unknown, dmvFipsSet: Set<string>): Observation[] {
  const rows = CensusResponseSchema.parse(raw);
  if (rows.length < 2) return [];

  const header = rows[0];
  if (!header) return [];

  const colIndex = new Map<string, number>();
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (h !== null) colIndex.set(h, i);
  }

  const stateCol = colIndex.get('state');
  const countyCol = colIndex.get('county');
  if (stateCol === undefined || countyCol === undefined) {
    throw new IngestError('Census response missing state/county columns', { source: 'census' });
  }

  const variableCols = VARIABLES.map((spec) => ({
    spec,
    col: colIndex.get(spec.variable),
  }));

  const minRequiredLen =
    Math.max(stateCol, countyCol, ...variableCols.map((v) => v.col ?? -1)) + 1;

  const all: Observation[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    if (row.length < minRequiredLen) {
      log.warn({ rowIndex: i, rowLength: row.length }, 'census: row too short; skipping');
      continue;
    }

    const stateFips = row[stateCol];
    const countyFips = row[countyCol];
    if (!stateFips || !countyFips) continue;

    const fips = `${stateFips.padStart(2, '0')}${countyFips.padStart(3, '0')}`;
    if (!dmvFipsSet.has(fips)) continue;

    for (const { spec, col } of variableCols) {
      if (col === undefined) continue;

      const cell = row[col];
      if (cell === null || cell === SENTINEL) {
        log.warn({ fips, variable: spec.variable }, 'census: missing value; skipping observation');
        continue;
      }

      const num = Number(cell);
      if (!Number.isFinite(num)) {
        log.warn({ fips, variable: spec.variable, cell }, 'census: non-numeric value; skipping observation');
        continue;
      }

      all.push({
        source: 'census',
        series: spec.variable,
        fips,
        metric: spec.metric,
        observedAt: OBSERVED_AT,
        value: num,
        unit: spec.unit,
      });
    }
  }

  return all;
}

async function fetchStateGroup(
  stateFips: string,
  countyParam: string,
  apiKey: string,
): Promise<unknown> {
  const variableList = VARIABLES.map((v) => v.variable).join(',');
  const url =
    `${BASE_URL}?get=NAME,${variableList},state,county` +
    `&for=county:${countyParam}&in=state:${stateFips}&key=${apiKey}`;

  try {
    return await fetchJson(url, { label: `census:state:${stateFips}` });
  } catch (err) {
    throw new IngestError(
      `Census fetch failed for state ${stateFips}`,
      { source: 'census' },
      err,
    );
  }
}

export class CensusSource implements DataSource {
  readonly name = 'census';
  readonly cadence = 'annual' as const;

  async fetch(): Promise<Observation[]> {
    const apiKey = getApiKey();
    const dmvFipsSet = buildDmvFipsSet();

    const stateGroups: Array<{ stateFips: string; countyParam: string }> = [
      { stateFips: '11', countyParam: '001' },
      { stateFips: '24', countyParam: '*' },
      { stateFips: '51', countyParam: '*' },
    ];

    const all: Observation[] = [];

    for (const { stateFips, countyParam } of stateGroups) {
      log.info({ stateFips }, 'census: fetching state group');
      try {
        const raw = await fetchStateGroup(stateFips, countyParam, apiKey);
        const obs = parseRows(raw, dmvFipsSet);
        all.push(...obs);
        log.info({ stateFips, count: obs.length }, 'census: state group done');
      } catch (err) {
        log.error(
          { stateFips, err: errMessage(err) },
          'census: state group failed; continuing',
        );
      }
    }

    return all;
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
```

- [ ] **Step 2.2: Run the tests**

```bash
npx vitest run scripts/ingest/census.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 2.3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2.4: Commit**

```bash
git add scripts/ingest/census.ts
git commit -m "feat: implement census ACS ingestor"
```

---

## Task 3: Update DATA_SOURCES.md

**Files:**
- Modify: `DATA_SOURCES.md`

- [ ] **Step 3.1: Update the ACS gotchas section**

In `DATA_SOURCES.md`, find the "Gotchas" block under section 3 (US Census Bureau) and replace:

```markdown
- Use the latest ACS year available (currently 2023 5-year). Check yearly for new release in December.
```

with:

```markdown
- ACS year is hardcoded as `ACS_YEAR = 2023` in `scripts/ingest/census.ts`. The 2024 5-year vintage was released December 2025 and is available — bump this constant in a follow-up PR.
- DC is queried as `for=county:001&in=state:11` (single county-equivalent).
- Independent VA cities are county-equivalents — same query pattern.
```

(Remove any duplicate lines already present about DC and independent VA cities.)

- [ ] **Step 3.2: Commit**

```bash
git add DATA_SOURCES.md
git commit -m "docs: update census ACS year note and gotchas"
```

---

## Task 4: Run the full test suite and lint

- [ ] **Step 4.1: Run all tests**

```bash
npm run test
```

Expected: all tests pass, no new failures.

- [ ] **Step 4.2: Run lint**

```bash
npm run lint
```

Expected: no errors.

---

## Task 5: Smoke test (optional — requires API key)

This step requires `CENSUS_API_KEY` set in your environment. Skip if you don't have one handy — CI will catch it.

- [ ] **Step 5.1: Run the census ingester**

```bash
CENSUS_API_KEY=your_key_here npx tsx scripts/ingest/run.ts --source=census
```

Expected output (structured JSON log lines, abbreviated):
```
{"level":30,"stateFips":"11","msg":"census: fetching state group"}
{"level":30,"stateFips":"11","count":3,"msg":"census: state group done"}
{"level":30,"stateFips":"24","msg":"census: fetching state group"}
{"level":30,"stateFips":"24","count":27,"msg":"census: state group done"}
{"level":30,"stateFips":"51","msg":"census: fetching state group"}
{"level":30,"stateFips":"51","count":33,"msg":"census: state group done"}
{"level":30,"source":"census","count":63,"durationMs":...,"msg":"ingest:done"}
```

63 = 21 counties × 3 variables. (Minor variation is fine if one or two counties have sentinel values for a metric.)

- [ ] **Step 5.2: Verify the cache file**

```bash
cat scripts/.cache/census.json | npx -y fx '.observations | length'
```

Expected: `63` (or close to it).
