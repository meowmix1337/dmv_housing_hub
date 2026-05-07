# Redfin Ingester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `RedfinSource` in `scripts/ingest/redfin.ts` to stream and parse the Redfin county market tracker TSV, producing weekly `Observation[]` for all DMV counties across 11 mapped metrics and 4 property types.

**Architecture:** HTTP response body is piped through `zlib.createGunzip()` and `csv-parse` using `stream/promises.pipeline` — no large in-memory buffer. Row filtering (weekly-only, DMV state codes, county region type) and FIPS resolution (county name + state_code → DMV_COUNTIES lookup) happen inline during stream consumption via a pure `parseRow` function extracted for testability.

**Tech Stack:** Node.js built-ins (`node:stream/promises`, `node:stream`, `node:zlib`), `csv-parse` (already in `scripts/package.json`), `vitest` for tests.

**Spec:** `docs/superpowers/specs/2026-05-07-redfin-ingester-design.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `scripts/ingest/redfin.ts` | Full implementation: constants, `parseRow`, `RedfinSource.fetch()` |
| Create | `scripts/ingest/redfin.test.ts` | Unit tests for `parseRow` using inline TSV fixture rows |

No other files change — `run.ts` already imports and registers `RedfinSource`; the transform already reads the `redfin` cache and uses the relevant metrics; `shared/src/types.ts` already has all required `MetricId` and `Unit` values.

---

## Task 1: Create test file with stub export

**Files:**
- Create: `scripts/ingest/redfin.test.ts`
- Modify: `scripts/ingest/redfin.ts` (add exported stub for `parseRow`)

- [ ] **Step 1: Add `parseRow` stub to redfin.ts**

Replace the entire contents of `scripts/ingest/redfin.ts` with:

```typescript
import type { Observation } from '@dmv/shared';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';

export function parseRow(
  _row: Record<string, string>,
  _fipsIndex: ReadonlyMap<string, string>,
): Observation[] {
  return [];
}

export class RedfinSource implements DataSource {
  readonly name = 'redfin';
  readonly cadence = 'weekly' as const;

  async fetch(): Promise<Observation[]> {
    throw new IngestError('RedfinSource not yet implemented', { source: 'redfin' });
  }
}
```

- [ ] **Step 2: Create the test file**

Create `scripts/ingest/redfin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseRow } from './redfin.js';

// Mirrors what buildFipsIndex() produces from DMV_COUNTIES
const FIPS_INDEX: ReadonlyMap<string, string> = new Map([
  ['montgomery county', '24031'],
  ['district of columbia', '11001'],
  ['alexandria city', '51510'],
  ['fairfax county', '51059'],
]);

function baseRow(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    period_begin: '2024-01-01',
    period_end: '2024-01-07',
    period_duration: '7',
    region_type: 'county',
    region: 'Montgomery County, MD',
    state: 'Maryland',
    state_code: 'MD',
    property_type: 'All Residential',
    median_sale_price: '500000',
    median_list_price: '520000',
    median_ppsf: '300',
    median_list_ppsf: '310',
    homes_sold: '150',
    pending_sales: '200',
    new_listings: '180',
    inventory: '400',
    months_of_supply: '1.5',
    median_dom: '12',
    avg_sale_to_list: '1.012',
    sold_above_list: '0.45',
    price_drops: '0.03',
    off_market_in_two_weeks: '0.25',
    ...overrides,
  };
}

describe('parseRow', () => {
  it('emits one observation per mapped column for a passing weekly row', () => {
    const obs = parseRow(baseRow(), FIPS_INDEX);
    expect(obs).toHaveLength(11);

    const salePrice = obs.find((o) => o.metric === 'median_sale_price');
    expect(salePrice).toMatchObject({
      source: 'redfin',
      series: 'redfin:county:all_residential',
      fips: '24031',
      metric: 'median_sale_price',
      observedAt: '2024-01-07',
      value: 500000,
      unit: 'USD',
    });

    const saleToList = obs.find((o) => o.metric === 'sale_to_list_ratio');
    expect(saleToList?.value).toBe(1.012);
    expect(saleToList?.unit).toBe('ratio');

    const soldAbove = obs.find((o) => o.metric === 'pct_sold_above_list');
    expect(soldAbove?.value).toBe(0.45);
    expect(soldAbove?.unit).toBe('percent');
  });

  it('returns empty array for monthly rows (period_duration = 30)', () => {
    const obs = parseRow(baseRow({ period_duration: '30' }), FIPS_INDEX);
    expect(obs).toHaveLength(0);
  });

  it('returns empty array for rows outside DMV (state_code = CA)', () => {
    const obs = parseRow(
      baseRow({ state_code: 'CA', region: 'San Diego County, CA' }),
      FIPS_INDEX,
    );
    expect(obs).toHaveLength(0);
  });

  it('resolves Alexandria city VA to FIPS 51510', () => {
    const obs = parseRow(
      baseRow({ region: 'Alexandria city, VA', state_code: 'VA' }),
      FIPS_INDEX,
    );
    const salePrice = obs.find((o) => o.metric === 'median_sale_price');
    expect(salePrice?.fips).toBe('51510');
  });
});
```

- [ ] **Step 3: Run the tests and confirm failures**

```bash
npx vitest run scripts/ingest/redfin.test.ts
```

Expected: 2 failures, 2 passes.

- Tests that **fail** (stub returns `[]`):
  - "emits one observation per mapped column…" — `expected 0 to be 11`
  - "resolves Alexandria city VA…" — `salePrice` is `undefined`
- Tests that **pass** by coincidence (correct answer is `[]`, stub returns `[]`):
  - "returns empty array for monthly rows"
  - "returns empty array for rows outside DMV"

---

## Task 2: Implement `parseRow` and the parsing constants

**Files:**
- Modify: `scripts/ingest/redfin.ts`

- [ ] **Step 1: Replace redfin.ts with the full parsing implementation (keep fetch() stub)**

```typescript
import type { MetricId, Observation, Unit } from '@dmv/shared';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';
import { DMV_COUNTIES } from '../lib/counties.js';
import { log } from '../lib/log.js';

const DMV_STATE_CODES = new Set(['DC', 'MD', 'VA']);

interface ColumnSpec {
  metric: MetricId;
  unit: Unit;
}

const COLUMN_MAP: Readonly<Record<string, ColumnSpec>> = {
  median_sale_price: { metric: 'median_sale_price', unit: 'USD' },
  median_list_price: { metric: 'median_list_price', unit: 'USD' },
  median_ppsf: { metric: 'median_price_per_sqft', unit: 'USD_per_sqft' },
  homes_sold: { metric: 'homes_sold', unit: 'count' },
  new_listings: { metric: 'new_listings', unit: 'count' },
  inventory: { metric: 'active_listings', unit: 'count' },
  months_of_supply: { metric: 'months_supply', unit: 'months' },
  median_dom: { metric: 'days_on_market', unit: 'days' },
  avg_sale_to_list: { metric: 'sale_to_list_ratio', unit: 'ratio' },
  sold_above_list: { metric: 'pct_sold_above_list', unit: 'percent' },
  price_drops: { metric: 'pct_price_drops', unit: 'percent' },
};

const PROPERTY_TYPE_SLUGS: Readonly<Record<string, string>> = {
  'All Residential': 'all_residential',
  'Single Family Residential': 'single_family',
  'Condo/Co-op': 'condo',
  'Townhouse': 'townhouse',
};

export function buildFipsIndex(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const county of DMV_COUNTIES) {
    map.set(county.name.toLowerCase(), county.fips);
  }
  return map;
}

export function parseRow(
  row: Record<string, string>,
  fipsIndex: ReadonlyMap<string, string>,
): Observation[] {
  if (row['period_duration'] !== '7') return [];
  if (row['region_type'] !== 'county') return [];
  if (!DMV_STATE_CODES.has(row['state_code'])) return [];

  const stateCode = row['state_code'];
  const regionRaw = row['region'] ?? '';
  const suffix = `, ${stateCode}`;
  const countyName = (
    regionRaw.endsWith(suffix) ? regionRaw.slice(0, -suffix.length) : regionRaw
  ).toLowerCase();

  const fips = fipsIndex.get(countyName);
  if (!fips) {
    log.warn({ region: row['region'], state_code: stateCode }, 'redfin: unresolved FIPS; skipping');
    return [];
  }

  const slug = PROPERTY_TYPE_SLUGS[row['property_type']];
  if (!slug) {
    log.warn({ property_type: row['property_type'] }, 'redfin: unknown property type; skipping');
    return [];
  }

  const observedAt = row['period_end'];
  if (!observedAt) return [];

  const series = `redfin:county:${slug}`;
  const observations: Observation[] = [];

  for (const [col, spec] of Object.entries(COLUMN_MAP)) {
    const raw = row[col];
    if (!raw || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    observations.push({
      source: 'redfin',
      series,
      fips,
      metric: spec.metric,
      observedAt,
      value,
      unit: spec.unit,
    });
  }

  return observations;
}

export class RedfinSource implements DataSource {
  readonly name = 'redfin';
  readonly cadence = 'weekly' as const;

  async fetch(): Promise<Observation[]> {
    throw new IngestError('RedfinSource.fetch() not yet implemented', { source: 'redfin' });
  }
}
```

- [ ] **Step 2: Run the tests and confirm all 4 pass**

```bash
npx vitest run scripts/ingest/redfin.test.ts
```

Expected output:
```
✓ scripts/ingest/redfin.test.ts (4)
  ✓ parseRow > emits one observation per mapped column for a passing weekly row
  ✓ parseRow > returns empty array for monthly rows (period_duration = 30)
  ✓ parseRow > returns empty array for rows outside DMV (state_code = CA)
  ✓ parseRow > resolves Alexandria city VA to FIPS 51510
```

---

## Task 3: Commit the parsing core

**Files:** `scripts/ingest/redfin.ts`, `scripts/ingest/redfin.test.ts`

- [ ] **Step 1: Stage and commit**

```bash
git add scripts/ingest/redfin.ts scripts/ingest/redfin.test.ts
git commit -m "feat: implement Redfin parseRow with COLUMN_MAP and FIPS resolution"
```

---

## Task 4: Implement `RedfinSource.fetch()` with the streaming pipeline

**Files:**
- Modify: `scripts/ingest/redfin.ts`

- [ ] **Step 1: Replace the full contents of redfin.ts with the complete implementation**

```typescript
import { pipeline } from 'node:stream/promises';
import { Readable, Writable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { parse } from 'csv-parse';
import type { MetricId, Observation, Unit } from '@dmv/shared';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';
import { fetchWithRetry } from '../lib/http.js';
import { DMV_COUNTIES } from '../lib/counties.js';
import { log } from '../lib/log.js';

const REDFIN_URL =
  'https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz';

const DMV_STATE_CODES = new Set(['DC', 'MD', 'VA']);

interface ColumnSpec {
  metric: MetricId;
  unit: Unit;
}

const COLUMN_MAP: Readonly<Record<string, ColumnSpec>> = {
  median_sale_price: { metric: 'median_sale_price', unit: 'USD' },
  median_list_price: { metric: 'median_list_price', unit: 'USD' },
  median_ppsf: { metric: 'median_price_per_sqft', unit: 'USD_per_sqft' },
  homes_sold: { metric: 'homes_sold', unit: 'count' },
  new_listings: { metric: 'new_listings', unit: 'count' },
  inventory: { metric: 'active_listings', unit: 'count' },
  months_of_supply: { metric: 'months_supply', unit: 'months' },
  median_dom: { metric: 'days_on_market', unit: 'days' },
  avg_sale_to_list: { metric: 'sale_to_list_ratio', unit: 'ratio' },
  sold_above_list: { metric: 'pct_sold_above_list', unit: 'percent' },
  price_drops: { metric: 'pct_price_drops', unit: 'percent' },
};

const PROPERTY_TYPE_SLUGS: Readonly<Record<string, string>> = {
  'All Residential': 'all_residential',
  'Single Family Residential': 'single_family',
  'Condo/Co-op': 'condo',
  'Townhouse': 'townhouse',
};

export function buildFipsIndex(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const county of DMV_COUNTIES) {
    map.set(county.name.toLowerCase(), county.fips);
  }
  return map;
}

export function parseRow(
  row: Record<string, string>,
  fipsIndex: ReadonlyMap<string, string>,
): Observation[] {
  if (row['period_duration'] !== '7') return [];
  if (row['region_type'] !== 'county') return [];
  if (!DMV_STATE_CODES.has(row['state_code'])) return [];

  const stateCode = row['state_code'];
  const regionRaw = row['region'] ?? '';
  const suffix = `, ${stateCode}`;
  const countyName = (
    regionRaw.endsWith(suffix) ? regionRaw.slice(0, -suffix.length) : regionRaw
  ).toLowerCase();

  const fips = fipsIndex.get(countyName);
  if (!fips) {
    log.warn({ region: row['region'], state_code: stateCode }, 'redfin: unresolved FIPS; skipping');
    return [];
  }

  const slug = PROPERTY_TYPE_SLUGS[row['property_type']];
  if (!slug) {
    log.warn({ property_type: row['property_type'] }, 'redfin: unknown property type; skipping');
    return [];
  }

  const observedAt = row['period_end'];
  if (!observedAt) return [];

  const series = `redfin:county:${slug}`;
  const observations: Observation[] = [];

  for (const [col, spec] of Object.entries(COLUMN_MAP)) {
    const raw = row[col];
    if (!raw || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    observations.push({
      source: 'redfin',
      series,
      fips,
      metric: spec.metric,
      observedAt,
      value,
      unit: spec.unit,
    });
  }

  return observations;
}

export class RedfinSource implements DataSource {
  readonly name = 'redfin';
  readonly cadence = 'weekly' as const;

  async fetch(): Promise<Observation[]> {
    log.info({ url: REDFIN_URL }, 'redfin: fetching county market tracker');

    let response: Response;
    try {
      response = await fetchWithRetry(REDFIN_URL, {
        label: 'redfin:county_tracker',
        timeoutMs: 300_000,
      });
    } catch (err) {
      throw new IngestError(
        'failed to download Redfin county tracker',
        { source: 'redfin', url: REDFIN_URL },
        err,
      );
    }

    if (!response.body) {
      throw new IngestError('Redfin response has no body', { source: 'redfin', url: REDFIN_URL });
    }

    const fipsIndex = buildFipsIndex();
    const all: Observation[] = [];

    // Readable.fromWeb converts the WHATWG ReadableStream (from fetch) to a Node.js Readable.
    // The cast through unknown is required because TypeScript's fetch and node:stream types
    // use different ReadableStream references despite being the same runtime object in Node 18+.
    const nodeReadable = Readable.fromWeb(
      response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    const gunzip = createGunzip();
    const tsvParser = parse({
      delimiter: '\t',
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
    const collector = new Writable({
      objectMode: true,
      write(row: Record<string, string>, _encoding, callback) {
        all.push(...parseRow(row, fipsIndex));
        callback();
      },
    });

    try {
      await pipeline(nodeReadable, gunzip, tsvParser, collector);
    } catch (err) {
      throw new IngestError(
        'stream pipeline failed for Redfin county tracker',
        { source: 'redfin' },
        err,
      );
    }

    if (all.length === 0) {
      log.warn('redfin: zero observations after filtering');
    } else {
      log.info({ count: all.length }, 'redfin: done');
    }

    return all;
  }
}
```

---

## Task 5: Typecheck, run tests, and commit

**Files:** `scripts/ingest/redfin.ts`

- [ ] **Step 1: Run typecheck across all workspaces**

```bash
npm run typecheck
```

Expected: no errors. If you see a type error on `Readable.fromWeb(...)`, confirm the cast reads:
```typescript
response.body as unknown as Parameters<typeof Readable.fromWeb>[0]
```

- [ ] **Step 2: Run the full scripts test suite to confirm nothing regressed**

```bash
npm run test --workspace=scripts
```

Expected: all tests pass (redfin.test.ts still has 4 passing tests; no other tests broken).

- [ ] **Step 3: Commit the complete implementation**

```bash
git add scripts/ingest/redfin.ts
git commit -m "feat: implement RedfinSource.fetch() with streaming gunzip pipeline"
```

---

## Self-Review Notes

- All 11 `MetricId` values used in `COLUMN_MAP` verified present in `shared/src/types.ts`
- All `Unit` values (`USD`, `USD_per_sqft`, `count`, `months`, `days`, `ratio`, `percent`) verified present
- `buildFipsIndex` is exported so tests can optionally use the real index for integration-style checks
- `relax_column_count: true` in csv-parse prevents parse errors if Redfin adds columns in a future file revision
- `timeoutMs: 300_000` (5 min) accommodates large file downloads on GitHub Actions
- No changes needed to `run.ts`, `build-county-pages.ts`, or `shared/src/types.ts`
