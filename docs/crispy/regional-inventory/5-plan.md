# Plan

Tactical execution plan for project `regional-inventory`. Seven slices follow the outline; deviations from the design are flagged inline.

## Deviations from design / outline

- **Slice 7 simplifies**: `scripts/transform/marketHealth.ts` already accepts `inventoryYoY` as a 4th input with weight 25 (not 20), so the function and weights stay as-is. Only the call site in `build-county-pages.ts` and the breakdown UI need touching. The design's "reweight" decision is already implemented in the function — what was missing is the wiring.
- **Slice 1 weekly drop scope**: dropping `PERIOD_DURATION === '7'` rows from `parseRow` would also drop weekly observations for *all* mapped Redfin metrics (median sale price, DOM, etc.), not just `active_listings`. Inspection of the dedup at `build-county-pages.ts:86-101` shows that whichever weekly/monthly row appears first wins for any metric — so weekly rows can corrupt any of the 11 mapped metrics, not just inventory. Plan removes weekly rows unconditionally, which is consistent with the project's monthly cadence and matches the pattern used by every other ingester.

---

## Slice 1: Data-quality fix in the Redfin pipeline

### Step 1.1 — Drop weekly rows in `parseRow`

File: `scripts/ingest/redfin.ts`

Replace lines 62–63:
```ts
const duration = row['PERIOD_DURATION'];
if (duration !== '7' && duration !== '30') return [];
```
with:
```ts
const duration = row['PERIOD_DURATION'];
if (duration !== '30') return [];
```

### Step 1.2 — Add Baltimore city name handling in `buildFipsIndex`

File: `scripts/ingest/redfin.ts`, function `buildFipsIndex` (~lines 44–56). Inside the loop, add a parallel branch for MD `*city` entries so Redfin's likely "Baltimore, MD" row resolves to `24510`:
```ts
for (const county of DMV_COUNTIES) {
  const key = county.name.toLowerCase();
  map.set(key, county.fips);
  // Strip ' city' suffix for any independent city (VA + MD).
  if (key.endsWith(' city')) {
    map.set(key.slice(0, -5), county.fips);
  }
}
```
(This is the same code as today; the existing branch already handles the MD case as long as the `isIndependentCity` flag is set on `24510`. Verify against `scripts/lib/counties.ts:91-99` — flag is present, so the existing branch should work. **If a manual run still misses Baltimore, add an explicit override entry**: `map.set('baltimore', '24510')` after the loop.)

### Step 1.3 — Update tests

File: `scripts/ingest/redfin.test.ts`

Update existing weekly-row test (line 35–57): the `baseRow()` default uses `PERIOD_DURATION: '7'`. Switch the default to `'30'`, then add a new test:
```ts
it('returns empty array for weekly rows (period_duration = 7)', () => {
  const obs = parseRow(baseRow({ PERIOD_DURATION: '7' }), FIPS_INDEX);
  expect(obs).toHaveLength(0);
});
```

Add a Baltimore city test mirroring the existing Alexandria pair:
```ts
it('resolves Baltimore city MD to FIPS 24510', () => {
  const obs = parseRow(baseRow({ REGION: 'Baltimore city, MD', STATE_CODE: 'MD' }), FIPS_INDEX);
  expect(obs.find((o) => o.metric === 'median_sale_price')?.fips).toBe('24510');
});
it('resolves Baltimore MD (no city suffix) to FIPS 24510', () => {
  const obs = parseRow(baseRow({ REGION: 'Baltimore, MD', STATE_CODE: 'MD' }), FIPS_INDEX);
  expect(obs.find((o) => o.metric === 'median_sale_price')?.fips).toBe('24510');
});
```

### Slice 1 checkpoint

```bash
npm run lint
npm run typecheck
npx vitest run scripts/ingest/redfin.test.ts
FRED_API_KEY=$FRED_API_KEY CENSUS_API_KEY=$CENSUS_API_KEY BLS_API_KEY=$BLS_API_KEY \
  npm run ingest:redfin --workspace=scripts
npm run transform --workspace=scripts
```

Expected: `web/public/data/counties/24510.json` exists with populated `series.activeListings`. `jq '.series.activeListings | last' web/public/data/counties/24031.json` returns a value in the low thousands (not 153). `jq '.series.activeListings | length' web/public/data/counties/11001.json` returns ~171 (one observation per month, no doubled weekly+monthly).

---

## Slice 2: Property-type breakdown in CountySeries

### Step 2.1 — Update shared types

File: `shared/src/types.ts`

After the `MetricSeries` interface, add:
```ts
export interface ActiveListingsByType {
  single_family: MetricPoint[];
  condo: MetricPoint[];
  townhouse: MetricPoint[];
  multi_family: MetricPoint[];
}

export interface ActiveListingsBreakdown {
  total: MetricPoint[];
  byType: ActiveListingsByType;
}
```

In `CountySeries`, replace `activeListings?: MetricPoint[];` with `activeListings?: ActiveListingsBreakdown;`.

### Step 2.2 — Build per-type breakdown in transform

File: `scripts/transform/build-county-pages.ts`

Replace the `activeObs`/`series.activeListings` lines (currently `:152, 167`) with a new helper:
```ts
const PROPERTY_TYPES = ['single_family', 'condo', 'townhouse', 'multi_family'] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number];

function buildActiveListingsBreakdown(
  forCounty: Observation[],
): ActiveListingsBreakdown | undefined {
  const byType: Record<PropertyType, MetricPoint[]> = {
    single_family: [], condo: [], townhouse: [], multi_family: [],
  };
  for (const t of PROPERTY_TYPES) {
    const seriesId = `redfin:county:${t}`;
    const obs = forCounty.filter(
      (o) => o.metric === 'active_listings' && o.series === seriesId,
    );
    byType[t] = toMetricPoints(obs);
  }
  // Build total = sum across types per date; require all 4 types present
  const dateSet = new Set<string>();
  for (const t of PROPERTY_TYPES) for (const p of byType[t]) dateSet.add(p.date);
  const total: MetricPoint[] = [];
  for (const date of [...dateSet].sort()) {
    let sum = 0; let n = 0;
    for (const t of PROPERTY_TYPES) {
      const p = byType[t].find((x) => x.date === date);
      if (p) { sum += p.value; n++; }
    }
    if (n === PROPERTY_TYPES.length) total.push({ date, value: sum });
  }
  if (total.length === 0) return undefined;
  return { total, byType };
}
```

Replace the existing dedup-based assignment to `series.activeListings` at `:167` with:
```ts
const breakdown = buildActiveListingsBreakdown(forCounty);
if (breakdown) series.activeListings = breakdown;
```

The build-county-pages dedup at `:86-101` keys on `(source, fips, metric, observedAt)`, which collapses property-type series. Update the dedup key to include `series` for Redfin rows so per-type observations survive:
```ts
const seen = new Set<string>();
const deduplicated = observations.filter((o) => {
  const key = o.source === 'redfin'
    ? `${o.source}:${o.series}:${o.fips}:${o.metric}:${o.observedAt}`
    : `${o.source}:${o.fips}:${o.metric}:${o.observedAt}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```

Remove the `all_residential`-first sort at `:86-91` — no longer needed.

### Step 2.3 — Add transform test

File: `scripts/transform/build-county-pages.test.ts` (new)

```ts
import { describe, it, expect } from 'vitest';
import type { Observation } from '@dmv/shared';
import { buildActiveListingsBreakdown } from './build-county-pages.js'; // export the helper
// (export the helper from build-county-pages.ts; main() stays as-is)

function obs(series: string, observedAt: string, value: number): Observation {
  return { source: 'redfin', series, fips: '11001', metric: 'active_listings',
    observedAt, value, unit: 'count' };
}

describe('buildActiveListingsBreakdown', () => {
  it('emits total = sum of four types when all present', () => {
    const o = [
      obs('redfin:county:single_family', '2024-01-31', 100),
      obs('redfin:county:condo',         '2024-01-31',  50),
      obs('redfin:county:townhouse',     '2024-01-31',  30),
      obs('redfin:county:multi_family',  '2024-01-31',  10),
    ];
    const r = buildActiveListingsBreakdown(o);
    expect(r?.total).toEqual([{ date: '2024-01-31', value: 190 }]);
  });
  it('omits dates where any of the four types is missing', () => {
    const o = [
      obs('redfin:county:single_family', '2024-01-31', 100),
      obs('redfin:county:condo',         '2024-01-31',  50),
      // townhouse missing for Jan
      obs('redfin:county:multi_family',  '2024-01-31',  10),
    ];
    const r = buildActiveListingsBreakdown(o);
    expect(r).toBeUndefined();
  });
});
```

Export the helper from `build-county-pages.ts` (currently it has only `main()`).

### Slice 2 checkpoint

```bash
npx vitest run scripts/transform/build-county-pages.test.ts
npm run typecheck
npm run transform --workspace=scripts
node -e 'const j = require("./web/public/data/counties/11001.json"); const a = j.series.activeListings; const i = a.total.length-1; console.log("date", a.total[i].date, "total", a.total[i].value, "sum", a.byType.single_family[i].value + a.byType.condo[i].value + a.byType.townhouse[i].value + a.byType.multi_family[i].value);'
```

Expected: `total === sum(byType[*])` for the latest index.

---

## Slice 3: DMV regional aggregate JSON

### Step 3.1 — Add aggregate type

File: `shared/src/types.ts`, append:
```ts
export interface ActiveListingsDmv {
  metric: 'active_listings';
  fips: 'DMV';
  unit: 'count';
  cadence: 'monthly';
  source: 'redfin';
  lastUpdated: string;
  asOf: string;
  latest: { total: number; byType: { single_family: number; condo: number; townhouse: number; multi_family: number } };
  latestYoY: number | undefined;
  series: ActiveListingsBreakdown;
  coverage: { fips: string[]; missing: string[] };
}
```

### Step 3.2 — Build aggregate in transform

File: `scripts/transform/build-county-pages.ts`

After the existing `federal-employment-dmv.json` block (~`:354-388`), add:
```ts
// DMV-wide active listings aggregate: sum by date and type, gated on full coverage.
const summariesByFips: Record<string, CountySummary> = {};
for (const c of DMV_COUNTIES) {
  const path = join(COUNTIES_DIR, `${c.fips}.json`);
  try { summariesByFips[c.fips] = await readJson<CountySummary>(path); } catch {}
}
const covered = Object.entries(summariesByFips)
  .filter(([, s]) => s.series.activeListings)
  .map(([f]) => f);
const missing = DMV_COUNTIES.filter((c) => !covered.includes(c.fips)).map((c) => c.fips);

if (covered.length > 0) {
  // Build per-month sums; require every covered county to report.
  const types = ['single_family', 'condo', 'townhouse', 'multi_family'] as const;
  const datesByCount = new Map<string, number>();
  for (const f of covered) {
    const total = summariesByFips[f].series.activeListings!.total;
    for (const p of total) datesByCount.set(p.date, (datesByCount.get(p.date) ?? 0) + 1);
  }
  const fullDates = [...datesByCount.entries()]
    .filter(([, n]) => n === covered.length).map(([d]) => d).sort();

  const seriesTotal: MetricPoint[] = [];
  const seriesByType: Record<typeof types[number], MetricPoint[]> = {
    single_family: [], condo: [], townhouse: [], multi_family: [],
  };
  for (const date of fullDates) {
    let sumTotal = 0;
    const sumByType: Record<typeof types[number], number> = {
      single_family: 0, condo: 0, townhouse: 0, multi_family: 0,
    };
    for (const f of covered) {
      const al = summariesByFips[f].series.activeListings!;
      sumTotal += al.total.find((p) => p.date === date)!.value;
      for (const t of types) sumByType[t] += al.byType[t].find((p) => p.date === date)!.value;
    }
    seriesTotal.push({ date, value: sumTotal });
    for (const t of types) seriesByType[t].push({ date, value: sumByType[t] });
  }

  if (seriesTotal.length > 0) {
    const last = seriesTotal.at(-1)!;
    const yearAgo = seriesTotal.findLast((p) => p.date <= isoYearAgo(last.date));
    const latestYoY = yearAgo ? (last.value - yearAgo.value) / yearAgo.value : undefined;
    const lastByType: ActiveListingsDmv['latest']['byType'] = {
      single_family: seriesByType.single_family.at(-1)!.value,
      condo: seriesByType.condo.at(-1)!.value,
      townhouse: seriesByType.townhouse.at(-1)!.value,
      multi_family: seriesByType.multi_family.at(-1)!.value,
    };
    await writeJsonAtomic(join(METRICS_DIR, 'active-listings-dmv.json'), {
      metric: 'active_listings', fips: 'DMV', unit: 'count', cadence: 'monthly', source: 'redfin',
      lastUpdated: generatedAt, asOf: last.date,
      latest: { total: last.value, byType: lastByType },
      latestYoY,
      series: { total: seriesTotal, byType: seriesByType },
      coverage: { fips: covered, missing },
    } satisfies ActiveListingsDmv);
  }
}
```

### Slice 3 checkpoint

```bash
npm run transform --workspace=scripts
jq '{asOf, latest, latestYoY, coverage}' web/public/data/metrics/active-listings-dmv.json
```

Expected: `coverage.fips.length === 20` (after Slice 1's Baltimore fix), `coverage.missing === ['51600']`. `latest.total` between 13,000 and 20,000. `latestYoY` is a small decimal (e.g. ±0.05). Series length matches the count of months where all 20 counties report.

---

## Slice 4: Home page stacked-area inventory chart

### Step 4.1 — API loader

File: `web/src/api.ts`

Append:
```ts
import type { ActiveListingsDmv } from '@dmv/shared';
export function getActiveListingsDmv(): Promise<ActiveListingsDmv> {
  return getJson<ActiveListingsDmv>('/metrics/active-listings-dmv.json');
}
```

### Step 4.2 — InventoryChart component

File: `web/src/components/home/InventoryChart.tsx` (new)

```tsx
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { ActiveListingsDmv } from '@dmv/shared';
import { DriverCard } from './DriverCard.js';
import { formatNumber, formatPercent } from '../../lib/format.js';

const TYPE_COLORS = {
  single_family: '#A4243B',  // base — prototype red
  condo:         '#D97706',
  townhouse:     '#7C2D12',
  multi_family:  '#92400E',
} as const;

const TYPE_ORDER = ['single_family', 'condo', 'townhouse', 'multi_family'] as const;
const TYPE_LABEL: Record<typeof TYPE_ORDER[number], string> = {
  single_family: 'Single-family', condo: 'Condo', townhouse: 'Townhouse', multi_family: 'Multi-family',
};

export function InventoryChart({ data }: { data: ActiveListingsDmv }) {
  const points = data.series.total.map((p, i) => ({
    date: p.date,
    single_family: data.series.byType.single_family[i].value,
    condo: data.series.byType.condo[i].value,
    townhouse: data.series.byType.townhouse[i].value,
    multi_family: data.series.byType.multi_family[i].value,
    total: p.value,
  }));
  const callout = `~${(data.latest.total / 1000).toFixed(1)}K`;
  const calloutColor =
    data.latestYoY === undefined ? 'var(--fg-1)' : data.latestYoY < 0 ? '#059669' : '#dc2626';
  const yoyLabel =
    data.latestYoY !== undefined ? `${formatPercent(data.latestYoY)} YoY` : 'YoY n/a';
  const direction =
    data.latestYoY === undefined ? 'flat' :
    Math.abs(data.latestYoY) < 0.02 ? 'roughly flat' :
    data.latestYoY > 0 ? `up ${yoyLabel}` : `down ${yoyLabel}`;
  const title = `DMV listings ${direction}`;

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#F4EFE5" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
          interval={11} axisLine={{ stroke: '#E7E2D8' }} tickLine={false}
          tickFormatter={(d: string) => `'${d.slice(2, 4)}`} />
        <YAxis tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
          axisLine={false} tickLine={false} width={36}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip contentStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)', borderRadius: 8, border: '1px solid #E7E2D8' }}
          formatter={(v, name) => [formatNumber(Number(v)), TYPE_LABEL[name as keyof typeof TYPE_LABEL] ?? String(name)]} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
        {TYPE_ORDER.map((t) => (
          <Area key={t} type="monotone" dataKey={t} stackId="a"
            stroke={TYPE_COLORS[t]} strokeWidth={1} fill={TYPE_COLORS[t]} fillOpacity={0.55}
            name={TYPE_LABEL[t]} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );

  return (
    <DriverCard
      kicker="Active inventory"
      title={title}
      callout={callout}
      calloutColor={calloutColor}
      chart={chart}
      source={`Redfin · DMV total · ${data.coverage.fips.length} counties · as of ${data.asOf}`}
    />
  );
}
```

### Step 4.3 — Wire into WhatsDriving and Home

File: `web/src/components/home/WhatsDriving.tsx`

- Add `inventory?: ActiveListingsDmv | undefined` to `WhatsDrivingProps`.
- Replace the placeholder block (lines 138–147) with:
  ```tsx
  {inventory ? (
    <InventoryChart data={inventory} />
  ) : (
    <Card padding="none" className="p-6 flex flex-col gap-3.5">
      <div className="eyebrow text-fg-3">Active inventory</div>
      <h3 className="font-display text-[22px] font-semibold tracking-tight leading-snug">
        Inventory data unavailable
      </h3>
      <p className="text-sm text-fg-2 leading-snug">Refresh, or check back after the next ingest.</p>
    </Card>
  )}
  ```
- Import `InventoryChart` and `ActiveListingsDmv`.

File: `web/src/pages/Home.tsx`

- Add `useQuery` for `getActiveListingsDmv` parallel to the existing `fedEmploymentResult`.
- Pass `inventory={inventoryResult.data}` to `<WhatsDriving>`.

### Step 4.4 — Tests

File: `web/src/pages/Home.test.tsx` — extend mock list with `/data/metrics/active-listings-dmv.json` returning a fixture with 24 monthly points.

### Slice 4 checkpoint

```bash
npm run typecheck && npm run lint && npm run test
npm run dev
# In a browser: load http://localhost:5173/, verify the third tile in
# "What's driving the market" is now a stacked area chart with four colors,
# the title reads "DMV listings <direction> X% YoY", and tooltip on hover shows
# all four type values.
```

---

## Slice 5: Fix MetricStrip "Active listings" YoY

### Step 5.1 — Update `deriveMetroSnapshot`

File: `web/src/lib/metro.ts`

Add an `inventory?: ActiveListingsDmv` parameter. Replace the broken lines:
```ts
activeListings: listingCounts.reduce((a, b) => a + b, 0) || undefined,
activeListingsYoY: median(salePriceYoYs),
```
with:
```ts
activeListings: inventory?.latest.total,
activeListingsYoY: inventory?.latestYoY,
```

Drop the now-unused `listingCounts` block.

### Step 5.2 — Wire from Home

File: `web/src/pages/Home.tsx` — pass `inventoryResult.data` into `deriveMetroSnapshot()`.

### Step 5.3 — Update tests

`web/src/pages/Home.test.tsx` — set `metro.activeListings` from the new aggregate fixture.

### Slice 5 checkpoint

```bash
npm run test && npm run dev
# Browser: confirm the "Active listings" tile in the MetricStrip shows the same
# number as the chart's callout, and the ▲/▼ arrow direction matches the chart title.
```

---

## Slice 6: County page inventory chart (last section)

### Step 6.1 — Component

File: `web/src/components/county/CountyInventory.tsx` (new)

Mirror `InventoryChart` but accept a `CountySummary` and render `series.activeListings` (county-scoped). Smaller dimensions (height ~240). Compute YoY from `series.activeListings.total`. If `summary.series.activeListings` is undefined, render `<InsufficientData eyebrow="Active inventory" caption="Inventory data not yet available for this county." />`.

### Step 6.2 — Append to County page

File: `web/src/pages/County.tsx` — find the last rendered section, append `<CountyInventory county={summary} />` after it. Wrap in a `<Container className="mt-12 mb-16">` to match existing spacing.

### Step 6.3 — Tests

`web/src/pages/County.test.tsx` — extend the existing populated-county fixture (line ~`70`) with an `activeListings` breakdown; assert chart renders. The existing `renders sparse county with InsufficientData placeholders` test should already cover the empty case once `CountyInventory` is added.

### Slice 6 checkpoint

```bash
npm run test && npm run dev
# Browser: load /county/11001 → stacked area renders at the bottom of the page.
# Load /county/51600 → InsufficientData placeholder renders cleanly.
```

---

## Slice 7: Market Health composite — wire inventory YoY through

### Step 7.1 — Pass `inventoryYoY` into `marketHealthScore`

File: `scripts/transform/build-county-pages.ts`

In `buildCountySummary`, after the `series.activeListings` assignment, compute YoY off `breakdown.total`:
```ts
let inventoryYoY: number | undefined;
const total = breakdown?.total;
if (total && total.length) {
  const last = total.at(-1)!;
  const yearAgo = total.findLast((p) => p.date <= isoYearAgo(last.date));
  if (yearAgo && yearAgo.value > 0) {
    inventoryYoY = (last.value - yearAgo.value) / yearAgo.value;
  }
}
```

Update the `marketHealthScore({...})` call (lines 259–263) to include `inventoryYoY`.

### Step 7.2 — Surface inventory YoY on `CountyCurrentSnapshot`

File: `shared/src/types.ts`, add `activeListingsYoY?: number;` to `CountyCurrentSnapshot`. Set it in `buildCountySummary` from the same `inventoryYoY` computed above.

### Step 7.3 — Update breakdown UI

File: `web/src/components/county/MarketHealthBreakdown.tsx`

In `computeSubScores` (lines 9–18), add a 4th branch matching the formula in `marketHealth.ts:25-28`:
```ts
if (current.activeListingsYoY !== undefined) {
  subs.push({ label: 'Inventory YoY',
    score: clamp(70 - current.activeListingsYoY * 100, 0, 100), weight: 25 });
}
```

Update caption (line 81): `Composite score · supply, sale-to-list, above-list, inventory YoY`.

### Step 7.4 — Tests

- `scripts/transform/marketHealth.test.ts` — add a test that passes all four inputs and checks the composite is the weight-blended average.
- `web/src/components/county/MarketHealthBreakdown.test.tsx` (if it exists) — add an inventory-YoY case; otherwise rely on `County.test.tsx` snapshot updates.

### Slice 7 checkpoint

```bash
npm run typecheck && npm run lint && npm run test
npm run transform --workspace=scripts
# Compare any one county's marketHealthScore before and after this slice:
jq '.current.marketHealthScore' web/public/data/counties/11001.json
# Browser: load /county/11001 → MarketHealthBreakdown card shows four sub-bars
# (Months of supply, Sale-to-list, % above list, Inventory YoY).
```

---

## Final integration checkpoint

```bash
npm run lint && npm run typecheck && npm run test
npm run build
```

Expected: build completes; the stacked area is visible on `/`; the County page renders the chart + the 4-bar Market Health card.

## Next
**Phase:** Implement
**Artifact to review:** `docs/crispy/regional-inventory/5-plan.md`
**Action:** Review structure and key decisions — this is a spot-check document. Then invoke `crispy-implement` with project name `regional-inventory`.
