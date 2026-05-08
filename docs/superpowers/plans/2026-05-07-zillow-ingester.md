# Zillow Ingester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `ZillowSource` in `scripts/ingest/zillow.ts` to download ZHVI and ZORI CSVs from Zillow Research and emit `Observation[]` in the project's standard format.

**Architecture:** Sequential download of 5 hardcoded CSV URLs (4 county-level, 1 metro-level), each parsed synchronously with `csv-parse/sync`, transposed from wide format (one column per month) to long `Observation[]`. FIPS resolution uses a name-lookup map built from `DMV_COUNTIES`. Metro observations are pinned to MSA FIPS `"47900"`.

**Tech Stack:** TypeScript (strict), `csv-parse/sync`, `fetchWithRetry` from `scripts/lib/http.ts`, `pino` logging, `vitest` for tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/ingest/zillow.ts` | Modify (currently a stub) | `FileSpec` type, `buildFipsIndex`, `parseRow`, `ZillowSource.fetch()`, `FILES` constant |
| `scripts/ingest/zillow.test.ts` | Create | Unit tests for `buildFipsIndex` and `parseRow` — no network calls |

---

## Task 1: `buildFipsIndex` — tests first, then implement

**Files:**
- Modify: `scripts/ingest/zillow.ts`
- Create: `scripts/ingest/zillow.test.ts`

- [ ] **Step 1: Write failing tests for `buildFipsIndex`**

Create `scripts/ingest/zillow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildFipsIndex } from './zillow.js';

describe('buildFipsIndex', () => {
  it('maps "montgomery county" to 24031', () => {
    const idx = buildFipsIndex();
    expect(idx.get('montgomery county')).toBe('24031');
  });

  it('maps "district of columbia" to 11001', () => {
    const idx = buildFipsIndex();
    expect(idx.get('district of columbia')).toBe('11001');
  });

  it('maps "prince george\'s county" to 24033', () => {
    const idx = buildFipsIndex();
    expect(idx.get("prince george's county")).toBe('24033');
  });

  it('maps "alexandria city" to 51510 (full lowercase name)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('alexandria city')).toBe('51510');
  });

  it('maps "alexandria" to 51510 (stripped city suffix)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('alexandria')).toBe('51510');
  });

  it('maps "falls church city" to 51610 (full name)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('falls church city')).toBe('51610');
  });

  it('maps "falls church" to 51610 (stripped suffix)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('falls church')).toBe('51610');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /path/to/repo && npx vitest run scripts/ingest/zillow.test.ts
```

Expected: error like `SyntaxError: The requested module './zillow.js' does not provide an export named 'buildFipsIndex'`

- [ ] **Step 3: Add `buildFipsIndex` to `scripts/ingest/zillow.ts`**

Replace the entire file with:

```ts
import type { MetricId, Observation, Unit } from '@dmv/shared';
import { parse } from 'csv-parse/sync';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';
import { DMV_COUNTIES } from '../lib/counties.js';
import { fetchWithRetry } from '../lib/http.js';
import { log } from '../lib/log.js';

export interface FileSpec {
  url: string;
  metric: MetricId;
  unit: Unit;
  scope: 'county' | 'metro';
}

export function buildFipsIndex(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const county of DMV_COUNTIES) {
    const key = county.name.toLowerCase();
    map.set(key, county.fips);
    // Strip " city" suffix so Zillow names without the suffix also resolve
    if (key.endsWith(' city')) {
      map.set(key.slice(0, -5).trimEnd(), county.fips);
    }
    // Strip " (city)" variant noted in DATA_SOURCES.md §5
    if (key.endsWith(' (city)')) {
      map.set(key.slice(0, -7).trimEnd(), county.fips);
    }
  }
  return map;
}

export class ZillowSource implements DataSource {
  readonly name = 'zillow';
  readonly cadence = 'monthly' as const;

  async fetch(): Promise<Observation[]> {
    throw new IngestError('ZillowSource not yet implemented', { source: 'zillow' });
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run scripts/ingest/zillow.test.ts
```

Expected: 7 passing tests, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/zillow.ts scripts/ingest/zillow.test.ts
git commit -m "feat: implement buildFipsIndex for Zillow FIPS resolution"
```

---

## Task 2: `parseRow` — county scope

**Files:**
- Modify: `scripts/ingest/zillow.ts`
- Modify: `scripts/ingest/zillow.test.ts`

- [ ] **Step 1: Add county `parseRow` tests to `zillow.test.ts`**

First, update the import line at the top of `scripts/ingest/zillow.test.ts` to add `parseRow` and `FileSpec`:

```ts
// Replace the existing import lines with:
import { describe, expect, it } from 'vitest';
import { buildFipsIndex, parseRow } from './zillow.js';
import type { FileSpec } from './zillow.js';
```

Then **append** the following after the existing `buildFipsIndex` describe block:

```ts
const COUNTY_SPEC: FileSpec = {
  url: 'https://example.com/County_zhvi_all.csv',
  metric: 'zhvi_all_homes',
  unit: 'USD',
  scope: 'county',
};

function baseCountyRow(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    RegionID: '3101',
    SizeRank: '1',
    RegionName: 'Montgomery County',
    RegionType: 'county',
    StateName: 'Maryland',
    State: 'MD',
    Metro: 'Washington, DC',
    StateCodeFIPS: '24',
    MunicipalCodeFIPS: '031',
    '2023-11-30': '',
    '2023-12-31': '550000',
    '2024-01-31': '555000',
    ...overrides,
  };
}

describe('parseRow - county scope', () => {
  const fipsIndex = buildFipsIndex();

  it('skips rows with out-of-DMV StateName', () => {
    const row = baseCountyRow({ StateName: 'California', RegionName: 'Los Angeles County' });
    expect(parseRow(row, COUNTY_SPEC, fipsIndex)).toHaveLength(0);
  });

  it('skips rows where RegionName is not in the DMV county list', () => {
    const row = baseCountyRow({ RegionName: 'Some Unknown County', StateName: 'Virginia' });
    expect(parseRow(row, COUNTY_SPEC, fipsIndex)).toHaveLength(0);
  });

  it('returns two observations for a valid row with one blank and two filled date columns', () => {
    const obs = parseRow(baseCountyRow(), COUNTY_SPEC, fipsIndex);
    expect(obs).toHaveLength(2);
  });

  it('emits correct observation shape for the first valid date', () => {
    const obs = parseRow(baseCountyRow(), COUNTY_SPEC, fipsIndex);
    expect(obs[0]).toMatchObject({
      source: 'zillow',
      series: 'zillow:county:zhvi_all_homes',
      fips: '24031',
      metric: 'zhvi_all_homes',
      observedAt: '2023-12-31',
      value: 550000,
      unit: 'USD',
    });
  });

  it('skips non-numeric values in date columns', () => {
    const row = baseCountyRow({ '2023-12-31': 'N/A', '2024-01-31': '555000' });
    const obs = parseRow(row, COUNTY_SPEC, fipsIndex);
    expect(obs).toHaveLength(1);
    expect(obs[0].value).toBe(555000);
  });

  it('ignores non-date columns', () => {
    const row = baseCountyRow();
    const obs = parseRow(row, COUNTY_SPEC, fipsIndex);
    // Only date-pattern columns should produce observations
    for (const o of obs) {
      expect(o.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('resolves "District of Columbia" (StateName) to fips 11001', () => {
    const row = baseCountyRow({
      RegionName: 'District of Columbia',
      StateName: 'District of Columbia',
    });
    const obs = parseRow(row, COUNTY_SPEC, fipsIndex);
    expect(obs.length).toBeGreaterThan(0);
    expect(obs[0].fips).toBe('11001');
    expect(obs[0].series).toBe('zillow:county:zhvi_all_homes');
  });
});
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
npx vitest run scripts/ingest/zillow.test.ts
```

Expected: the 7 buildFipsIndex tests still pass; the new `parseRow` tests fail because `parseRow` is not exported.

- [ ] **Step 3: Add `parseRow` (county scope) to `scripts/ingest/zillow.ts`**

Add these constants and function after `buildFipsIndex` (before the class):

```ts
const DMV_STATE_NAMES = new Set(['District of Columbia', 'Maryland', 'Virginia']);
const DATE_COL_RE = /^\d{4}-\d{2}-\d{2}$/;
const DC_METRO_REGION = 'Washington, DC';
const DC_METRO_FIPS = '47900';

export function parseRow(
  row: Record<string, string>,
  spec: FileSpec,
  fipsIndex: ReadonlyMap<string, string>,
): Observation[] {
  let fips: string;
  let series: string;

  if (spec.scope === 'metro') {
    // Metro handled in Task 3
    return [];
  }

  // County scope
  const stateName = row['StateName'] ?? '';
  if (!DMV_STATE_NAMES.has(stateName)) return [];

  const regionName = (row['RegionName'] ?? '').toLowerCase();
  const resolved = fipsIndex.get(regionName);
  if (!resolved) {
    log.debug({ region: row['RegionName'], state: stateName }, 'zillow: county not in DMV; skipping');
    return [];
  }
  fips = resolved;
  series = `zillow:county:${spec.metric}`;

  const observations: Observation[] = [];
  for (const [col, raw] of Object.entries(row)) {
    if (!DATE_COL_RE.test(col)) continue;
    if (!raw || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    observations.push({
      source: 'zillow',
      series,
      fips,
      metric: spec.metric,
      observedAt: col,
      value,
      unit: spec.unit,
    });
  }
  return observations;
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
npx vitest run scripts/ingest/zillow.test.ts
```

Expected: all tests pass (7 `buildFipsIndex` + new county `parseRow` tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/zillow.ts scripts/ingest/zillow.test.ts
git commit -m "feat: implement parseRow for Zillow county scope"
```

---

## Task 3: `parseRow` — metro scope

**Files:**
- Modify: `scripts/ingest/zillow.ts`
- Modify: `scripts/ingest/zillow.test.ts`

- [ ] **Step 1: Add metro `parseRow` tests to `zillow.test.ts`**

Append to `scripts/ingest/zillow.test.ts`:

```ts
const METRO_SPEC: FileSpec = {
  url: 'https://example.com/Metro_zhvi_all.csv',
  metric: 'zhvi_all_homes',
  unit: 'USD',
  scope: 'metro',
};

function baseMetroRow(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    RegionID: '102001',
    SizeRank: '4',
    RegionName: 'Washington, DC',
    RegionType: 'msa',
    StateName: 'DC',
    '2024-01-31': '620000',
    '2024-02-29': '625000',
    ...overrides,
  };
}

describe('parseRow - metro scope', () => {
  const fipsIndex = buildFipsIndex();

  it('skips non-DC metro rows', () => {
    const row = baseMetroRow({ RegionName: 'Chicago, IL' });
    expect(parseRow(row, METRO_SPEC, fipsIndex)).toHaveLength(0);
  });

  it('skips non-DC metro rows regardless of StateName', () => {
    const row = baseMetroRow({ RegionName: 'New York, NY', StateName: 'NY' });
    expect(parseRow(row, METRO_SPEC, fipsIndex)).toHaveLength(0);
  });

  it('matches "Washington, DC" and assigns fips 47900', () => {
    const obs = parseRow(baseMetroRow(), METRO_SPEC, fipsIndex);
    expect(obs.length).toBeGreaterThan(0);
    expect(obs[0]).toMatchObject({
      source: 'zillow',
      series: 'zillow:metro:zhvi_all_homes',
      fips: '47900',
      metric: 'zhvi_all_homes',
      observedAt: '2024-01-31',
      value: 620000,
      unit: 'USD',
    });
  });

  it('emits one observation per filled date column', () => {
    const obs = parseRow(baseMetroRow(), METRO_SPEC, fipsIndex);
    expect(obs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests — verify new metro tests fail**

```bash
npx vitest run scripts/ingest/zillow.test.ts
```

Expected: county tests still pass; metro tests fail because `parseRow` returns `[]` for `scope === 'metro'`.

- [ ] **Step 3: Add metro handling to `parseRow` in `scripts/ingest/zillow.ts`**

Replace the `if (spec.scope === 'metro') { return []; }` block with the full metro path:

```ts
  if (spec.scope === 'metro') {
    if (row['RegionName'] !== DC_METRO_REGION) return [];
    fips = DC_METRO_FIPS;
    series = `zillow:metro:${spec.metric}`;
  } else {
    // County scope
    const stateName = row['StateName'] ?? '';
    if (!DMV_STATE_NAMES.has(stateName)) return [];

    const regionName = (row['RegionName'] ?? '').toLowerCase();
    const resolved = fipsIndex.get(regionName);
    if (!resolved) {
      log.debug({ region: row['RegionName'], state: stateName }, 'zillow: county not in DMV; skipping');
      return [];
    }
    fips = resolved;
    series = `zillow:county:${spec.metric}`;
  }
```

The date-column loop below remains unchanged.

The complete `parseRow` function after this change:

```ts
export function parseRow(
  row: Record<string, string>,
  spec: FileSpec,
  fipsIndex: ReadonlyMap<string, string>,
): Observation[] {
  let fips: string;
  let series: string;

  if (spec.scope === 'metro') {
    if (row['RegionName'] !== DC_METRO_REGION) return [];
    fips = DC_METRO_FIPS;
    series = `zillow:metro:${spec.metric}`;
  } else {
    const stateName = row['StateName'] ?? '';
    if (!DMV_STATE_NAMES.has(stateName)) return [];

    const regionName = (row['RegionName'] ?? '').toLowerCase();
    const resolved = fipsIndex.get(regionName);
    if (!resolved) {
      log.debug({ region: row['RegionName'], state: stateName }, 'zillow: county not in DMV; skipping');
      return [];
    }
    fips = resolved;
    series = `zillow:county:${spec.metric}`;
  }

  const observations: Observation[] = [];
  for (const [col, raw] of Object.entries(row)) {
    if (!DATE_COL_RE.test(col)) continue;
    if (!raw || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    observations.push({
      source: 'zillow',
      series,
      fips,
      metric: spec.metric,
      observedAt: col,
      value,
      unit: spec.unit,
    });
  }
  return observations;
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
npx vitest run scripts/ingest/zillow.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/zillow.ts scripts/ingest/zillow.test.ts
git commit -m "feat: extend parseRow to handle Zillow metro scope"
```

---

## Task 4: Implement `ZillowSource.fetch()`

**Files:**
- Modify: `scripts/ingest/zillow.ts`

- [ ] **Step 1: Replace the stub `fetch()` with the full implementation**

Replace the `ZillowSource` class entirely. The complete final `scripts/ingest/zillow.ts` is:

```ts
import type { MetricId, Observation, Unit } from '@dmv/shared';
import { parse } from 'csv-parse/sync';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';
import { DMV_COUNTIES } from '../lib/counties.js';
import { fetchWithRetry } from '../lib/http.js';
import { log } from '../lib/log.js';

export interface FileSpec {
  url: string;
  metric: MetricId;
  unit: Unit;
  scope: 'county' | 'metro';
}

const ZHVI_BASE = 'https://files.zillowstatic.com/research/public_csvs/zhvi';
const ZORI_BASE = 'https://files.zillowstatic.com/research/public_csvs/zori';

const FILES: readonly FileSpec[] = [
  {
    url: `${ZHVI_BASE}/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
    metric: 'zhvi_all_homes',
    unit: 'USD',
    scope: 'county',
  },
  {
    url: `${ZHVI_BASE}/County_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv`,
    metric: 'zhvi_sfh',
    unit: 'USD',
    scope: 'county',
  },
  {
    url: `${ZHVI_BASE}/County_zhvi_uc_condo_tier_0.33_0.67_sm_sa_month.csv`,
    metric: 'zhvi_condo',
    unit: 'USD',
    scope: 'county',
  },
  {
    url: `${ZORI_BASE}/County_zori_uc_sfrcondomfr_sm_sa_month.csv`,
    metric: 'zori_rent',
    unit: 'USD',
    scope: 'county',
  },
  {
    url: `${ZHVI_BASE}/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
    metric: 'zhvi_all_homes',
    unit: 'USD',
    scope: 'metro',
  },
];

const DMV_STATE_NAMES = new Set(['District of Columbia', 'Maryland', 'Virginia']);
const DATE_COL_RE = /^\d{4}-\d{2}-\d{2}$/;
const DC_METRO_REGION = 'Washington, DC';
const DC_METRO_FIPS = '47900';

export function buildFipsIndex(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const county of DMV_COUNTIES) {
    const key = county.name.toLowerCase();
    map.set(key, county.fips);
    if (key.endsWith(' city')) {
      map.set(key.slice(0, -5).trimEnd(), county.fips);
    }
    if (key.endsWith(' (city)')) {
      map.set(key.slice(0, -7).trimEnd(), county.fips);
    }
  }
  return map;
}

export function parseRow(
  row: Record<string, string>,
  spec: FileSpec,
  fipsIndex: ReadonlyMap<string, string>,
): Observation[] {
  let fips: string;
  let series: string;

  if (spec.scope === 'metro') {
    if (row['RegionName'] !== DC_METRO_REGION) return [];
    fips = DC_METRO_FIPS;
    series = `zillow:metro:${spec.metric}`;
  } else {
    const stateName = row['StateName'] ?? '';
    if (!DMV_STATE_NAMES.has(stateName)) return [];

    const regionName = (row['RegionName'] ?? '').toLowerCase();
    const resolved = fipsIndex.get(regionName);
    if (!resolved) {
      log.debug({ region: row['RegionName'], state: stateName }, 'zillow: county not in DMV; skipping');
      return [];
    }
    fips = resolved;
    series = `zillow:county:${spec.metric}`;
  }

  const observations: Observation[] = [];
  for (const [col, raw] of Object.entries(row)) {
    if (!DATE_COL_RE.test(col)) continue;
    if (!raw || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    observations.push({
      source: 'zillow',
      series,
      fips,
      metric: spec.metric,
      observedAt: col,
      value,
      unit: spec.unit,
    });
  }
  return observations;
}

export class ZillowSource implements DataSource {
  readonly name = 'zillow';
  readonly cadence = 'monthly' as const;

  async fetch(): Promise<Observation[]> {
    const fipsIndex = buildFipsIndex();
    const all: Observation[] = [];

    for (const spec of FILES) {
      log.info({ url: spec.url, metric: spec.metric, scope: spec.scope }, 'zillow: fetching');
      let response: Response;
      try {
        response = await fetchWithRetry(spec.url, {
          label: `zillow:${spec.metric}:${spec.scope}`,
          timeoutMs: 120_000,
        });
      } catch (err) {
        log.error({ url: spec.url, err: errMessage(err) }, 'zillow: fetch failed; skipping file');
        continue;
      }

      const text = await response.text();
      const rows = parse(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
      let fileObs = 0;
      for (const row of rows) {
        const obs = parseRow(row, spec, fipsIndex);
        all.push(...obs);
        fileObs += obs.length;
      }
      log.info({ metric: spec.metric, scope: spec.scope, count: fileObs }, 'zillow: file done');
    }

    if (all.length === 0) {
      log.warn('zillow: zero observations after processing all files');
    } else {
      log.info({ count: all.length }, 'zillow: done');
    }

    return all;
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
```

Note: the `IngestError` import is still needed only if you want to keep it for future use; it's no longer called in this version. Remove it if the linter flags it as unused.

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```bash
npm run test --workspace=scripts
```

Expected: all existing tests pass, including the zillow tests from Tasks 1–3.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Lint**

```bash
npm run lint
```

Expected: no errors. If `IngestError` is flagged as an unused import, remove it from the import line at the top of `zillow.ts`.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/zillow.ts
git commit -m "feat: implement ZillowSource.fetch() with FILES constant"
```
