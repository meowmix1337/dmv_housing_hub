# Plan

Tactical, step-by-step execution. Each slice = one PR. No deviations from `3-design.md` decisions.

---

## Slice 1 — Ingester produces valid `qcew.json` cache

### S1.1 Extend types
**File:** `shared/src/types.ts`
- In `CountyCurrentSnapshot`, append three optional fields after `unemploymentRate` (mirrors the `zhvi`/`zhviYoY` adjacency):
  ```ts
  federalEmployment?: number;
  federalEmploymentYoY?: number;
  federalEmploymentAsOf?: string;
  ```
- In `CountySeries`, append:
  ```ts
  federalEmployment?: MetricPoint[];
  ```
- No edits to `MetricId` (already includes `federal_employment`) or `Unit` (already includes `count`).

**Verify:** `npm run typecheck` clean.

### S1.2 Create the ingester
**File:** `scripts/ingest/qcew.ts` (new)

Module exports:
- `class QcewSource implements DataSource` (named export) with `name='qcew'`, `cadence='quarterly'`.
- Pure helpers (named exports for unit testing): `parseQcewCsv(csv: string): QcewRow[]`, `selectFederalCountyTotal(rows: QcewRow[]): QcewRow | null`, `rowToObservation(row: QcewRow, fips: string): Observation | null`, `quarterToObservedAt(year: number, qtr: 1|2|3|4): string`, `runWithConcurrency<T,R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]>`.

Constants:
```ts
const QCEW_BASE = 'https://data.bls.gov/cew/data/api';
const START_YEAR = 2015;
const QUARTERS = [1, 2, 3, 4] as const;
const CONCURRENCY = 4;
```

`QcewRow` interface (only the fields we use; CSV has 42 total):
```ts
interface QcewRow {
  area_fips: string;
  own_code: string;
  industry_code: string;
  agglvl_code: string;
  year: string;
  qtr: string;
  disclosure_code: string;
  month3_emplvl: string;
}
```

Parse path: use `csv-parse/sync` (`parse(csv, { columns: true, skip_empty_lines: true })`) — file size is ~50 KB so streaming is unnecessary; this matches the simpler synchronous shape relative to redfin's stream pipeline.

`selectFederalCountyTotal`: returns the single row matching `own_code === '1' && agglvl_code === '71' && industry_code === '10'`, or `null` if not present.

`rowToObservation`:
- Return `null` if `disclosure_code === 'N'` and `log.warn({ fips, year: row.year, qtr: row.qtr }, 'qcew: suppressed; skipping')`.
- Parse `month3_emplvl` to number; return `null` if not finite (warn similarly).
- Build:
  ```ts
  const series = `qcew:${fips}:${row.year}Q${row.qtr}:own1:naics10`;
  return { source: 'qcew', series, fips, metric: 'federal_employment',
           observedAt: quarterToObservedAt(Number(row.year), Number(row.qtr) as 1|2|3|4),
           value: emplvl, unit: 'count' };
  ```

`quarterToObservedAt`: switch on qtr → `'03-01' | '06-01' | '09-01' | '12-01'`; concat `${year}-${suffix}`.

`runWithConcurrency`: simple promise pool; consume items in order using `limit` workers. ~25 lines, no dep.

`QcewSource.fetch()`:
1. `const currentYear = new Date().getUTCFullYear();`
2. Build a list of `{ fips, year, qtr }` triples for all DMV counties × quarters from `START_YEAR` to `currentYear`. Skip future quarters (year/qtr beyond now).
3. For each, build URL `${QCEW_BASE}/${year}/${qtr}/area/${fips}.csv` and fetch via `fetchWithRetry(url, { label: `qcew:${fips}:${year}Q${qtr}` })`.
4. On 404 (no data yet for very recent quarter), `log.warn` and skip — this happens because BLS publishes ~6 months after quarter end. (404 surfaces as `HttpError`; catch and skip; let other status codes throw.)
5. Parse → select → map to `Observation | null`; collect non-null.
6. Return flat `Observation[]`.

Failures inside parse/select are local skips with `log.warn`. Network/system failures bubble as `IngestError` with `source: 'qcew'`.

### S1.3 Register source
**File:** `scripts/ingest/run.ts`
- Add import: `import { QcewSource } from './qcew.js';`
- Add registry entry: `qcew: () => new QcewSource(),`

### S1.4 Add npm script
**File:** `scripts/package.json`
- Add to `scripts`: `"ingest:qcew": "tsx ingest/run.ts --source=qcew"` (matches sibling `ingest:fred` shape).

### S1.5 Unit tests
**File:** `scripts/ingest/qcew.test.ts` (new)
- Test 1 — `quarterToObservedAt`: assert Q1→`'2024-03-01'`, Q4→`'2024-12-01'`.
- Test 2 — `parseQcewCsv` + `selectFederalCountyTotal`: feed a 4-row fixture (one matching, one own=5, one agglvl=70, one industry=101); assert exactly the matching row returns.
- Test 3 — `rowToObservation` disclosed: returns `Observation` with expected `series`, `observedAt`, `value`.
- Test 4 — `rowToObservation` with `disclosure_code='N'`: returns `null`.
- Test 5 — `rowToObservation` with non-finite `month3_emplvl`: returns `null`.
- Test 6 — `runWithConcurrency` keeps order and respects limit (count active workers via a counter).

### Slice 1 Checkpoint
```bash
npm run typecheck                          # clean
npm run test --workspace=scripts -- qcew   # all 6 tests pass
npm run ingest:qcew --workspace=scripts    # ~30 sec, exits 0
```
Then:
```bash
jq '.count, (.observations | length)' scripts/.cache/qcew.json
# both ~840 (21 counties × 4 qtrs × ~10 yrs minus future quarters)
jq '[.observations[] | select(.fips=="11001" and .observedAt=="2024-03-01")] | .[0].value' \
  scripts/.cache/qcew.json
# 192845 (matches research §Q11)
```

---

## Slice 2 — Transform writes new fields into county JSONs and DMV-aggregate file

### S2.1 Register source in transform
**File:** `scripts/transform/build-county-pages.ts`
- Add `'qcew'` to the `SOURCES` tuple at line 46.
- Add a `case 'qcew': return 'quarterly';` arm to `cadenceFor` at line 109.

### S2.2 Wire `federalEmployment` into per-county summary
**File:** `scripts/transform/build-county-pages.ts` (extend `buildCountySummary`)

Inside `buildCountySummary` after `incomeObs`:
```ts
const fedObs = forCounty.filter(
  (o) => o.metric === 'federal_employment' && o.source === 'qcew',
);
```
Below the existing `if (incomeObs.length) ...`:
```ts
if (fedObs.length) {
  series.federalEmployment = toMetricPoints(fedObs);
  const latest = series.federalEmployment.at(-1);
  if (latest) {
    summary.current.federalEmployment = latest.value;
    summary.current.federalEmploymentAsOf = latest.date;
    const yearAgo = series.federalEmployment.findLast(
      (p: MetricPoint) => p.date <= isoYearAgo(latest.date),
    );
    if (yearAgo) {
      summary.current.federalEmploymentYoY =
        (latest.value - yearAgo.value) / yearAgo.value;
    }
  }
}
```
Source filter (`o.source === 'qcew'`) is required to avoid colliding with the existing CES MSA-level `federal_employment` series ingested by `bls.ts` (FIPS `'11-metro'`); even though FIPS differs, defensive filter prevents future regressions.

### S2.3 Emit DMV-aggregate metric file
**File:** `scripts/transform/build-county-pages.ts` (extend `main`)

After the per-county loop and before manifest write, add:
```ts
const fedAll = observations.filter(
  (o) => o.metric === 'federal_employment' && o.source === 'qcew',
);
if (fedAll.length) {
  // Group by observedAt; sum across the 21 DMV FIPS only when all are present
  const byDate = new Map<string, number>();
  const countByDate = new Map<string, number>();
  for (const o of fedAll) {
    if (!DMV_COUNTIES.some((c) => c.fips === o.fips)) continue;
    byDate.set(o.observedAt, (byDate.get(o.observedAt) ?? 0) + o.value);
    countByDate.set(o.observedAt, (countByDate.get(o.observedAt) ?? 0) + 1);
  }
  // Keep only quarters where all 21 counties reported (defends against partial suppression)
  const fullQuarters = [...byDate.entries()]
    .filter(([d]) => countByDate.get(d) === DMV_COUNTIES.length)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (fullQuarters.length) {
    const latest = fullQuarters.at(-1)!;
    const yearAgo = fullQuarters.findLast((p) => p.date <= isoYearAgo(latest.date));
    const yoy = yearAgo ? (latest.value - yearAgo.value) / yearAgo.value : undefined;
    await writeJsonAtomic(join(METRICS_DIR, 'federal-employment-dmv.json'), {
      metric: 'federal_employment',
      fips: 'DMV',
      unit: 'count',
      cadence: 'quarterly',
      source: 'qcew',
      lastUpdated: generatedAt,
      total: latest.value,
      totalYoY: yoy,
      asOf: latest.date,
      points: fullQuarters,
    });
  } else {
    log.warn('no fully-disclosed DMV quarters; skipping federal-employment-dmv.json');
  }
}
```
The shape is parallel to `mortgage-rates.json` (existing prior art at line 309), with three extras (`total`, `totalYoY`, `asOf`) so the Home page can render a single stat block from the file alone.

### Slice 2 Checkpoint
```bash
npm run ingest:qcew --workspace=scripts        # if cache from S1 absent
npm run transform --workspace=scripts          # exits 0; logs include qcew loaded
npm run typecheck                              # clean

# Per-county fields populated:
jq '.current.federalEmployment, .current.federalEmploymentYoY, .current.federalEmploymentAsOf,
    (.series.federalEmployment | length)' \
  web/public/data/counties/11001.json
# ~192845, finite ratio, "YYYY-MM-01", >=36

# Aggregate file present:
jq '.total, .totalYoY, .asOf, (.points | length)' \
  web/public/data/metrics/federal-employment-dmv.json
# six-figure total, finite ratio, ISO date, >=36

# Manifest:
jq '.sources[] | select(.name=="qcew")' web/public/data/manifest.json
# entry with cadence:"quarterly"
```

---

## Slice 3 — County page surfaces card + chart

### S3.1 Snapshot card
**File:** `web/src/components/county/SnapshotGrid.tsx`

Add a new metric card invocation alongside the existing `zhviYoY` card. Pattern-match the existing render (use `change={current.federalEmploymentYoY}`, `value={current.federalEmployment}`, label `"Federal employment"`). If `federalEmployment` is `undefined`, render `—` and omit the YoY change (existing card pattern handles this).

### S3.2 Trend chart
**File:** `web/src/pages/County.tsx`

Below the existing trend charts (likely a `<PriceChart>` or similar Recharts component), add a Recharts `<LineChart>` (or reuse an existing generic chart component) bound to `summary.series.federalEmployment`. Title: "Federal employment". Y-axis: integer count. X-axis: quarterly. If `series.federalEmployment` is undefined, render nothing (don't show empty card).

### S3.3 Source attribution
**File:** wherever the County page already renders source labels (likely a footer/legend within the trend chart card).

Append the QCEW citation: `"Source: U.S. Bureau of Labor Statistics, Quarterly Census of Employment and Wages."` Use the same component the existing source labels use; do not invent a new attribution component.

### S3.4 Test fixture update
**File:** `web/src/pages/County.test.tsx`
- Extend the existing `CountySummary` mock to populate `current.federalEmployment`, `…YoY`, `…AsOf`, and a small `series.federalEmployment` (3-4 points).
- Assert the new card is rendered with expected formatted text.

### Slice 3 Checkpoint
```bash
npm run typecheck && npm run lint           # clean
npm run test --workspace=web -- County      # passes (with extended fixture)
npm run dev                                 # serve locally
```
Manual browser checks:
- `/county/11001` — card shows ~193K with YoY %, "as of YYYY-MM-DD" subtitle; trend line renders 2015→present.
- `/county/51685` — card renders the small Manassas Park value (e.g., 25) without crashes.
- `/county/24009` — Calvert (~417 jobs) chart line continuous, no gaps.
- Source attribution string visible.

---

## Slice 4 — Home page DMV-aggregate stat

### S4.1 Typed fetcher
**File:** `web/src/api.ts`

Add a typed wrapper alongside `getCountySummary`:
```ts
export interface FederalEmploymentDmv {
  metric: 'federal_employment';
  fips: 'DMV';
  unit: 'count';
  cadence: 'quarterly';
  source: 'qcew';
  lastUpdated: string;
  total: number;
  totalYoY?: number;
  asOf: string;
  points: { date: string; value: number }[];
}

export function getFederalEmploymentDmv(): Promise<FederalEmploymentDmv> {
  return getJson<FederalEmploymentDmv>('/metrics/federal-employment-dmv.json');
}
```

### S4.2 Home stat block
**File:** `web/src/pages/Home.tsx`

Add a `useQuery` call for `getFederalEmploymentDmv` parallel to existing data fetches (React Query, `staleTime` matches sibling fetches). Render a stat block in the existing overview-stats row:
- Label: "DMV federal jobs"
- Value: `formatNumber(data.total)` (e.g., "412,500")
- Subtitle: `formatPercent(data.totalYoY) + " YoY · as of " + formatDate(data.asOf)`, hide YoY clause if undefined.
- Source attribution beneath.

If the query is `isLoading` or `isError`, render the existing skeleton/error states or simply omit the block (match sibling pattern).

### S4.3 Test fixture
**File:** `web/src/pages/Home.test.tsx`
- Mock `getFederalEmploymentDmv` to return a small fixture; assert the rendered stat shows expected formatted total.

### Slice 4 Checkpoint
```bash
npm run typecheck && npm run lint           # clean
npm run test --workspace=web -- Home        # passes
npm run dev
```
Browser:
- `/` — stat block "DMV federal jobs: ~410K (+X% YoY · as of YYYY-MM-DD)" visible.
- Sum equals `jq '[.[]|.current.federalEmployment]|add' web/public/data/counties/*.json` (or matches `total` in the metric file when all 21 counties have the same `asOf`).

```bash
npm run build                                # exits 0; web/dist/ produced
ls web/dist/data/metrics/federal-employment-dmv.json   # exists
```

---

## Cross-slice conventions

- **Branch per slice**, named `feat/qcew-s1-ingester`, `feat/qcew-s2-transform`, `feat/qcew-s3-county-ui`, `feat/qcew-s4-home-stat`.
- **Conventional commits** (`feat:` for new functionality; `data:` only if a slice does an actual data refresh).
- **One PR per slice** against `main`.
- Run `npm run typecheck && npm run lint && npm run test` before opening each PR (per `CLAUDE.md`).

## Deviations from design

None. The plan implements §3-design.md verbatim. The single concrete refinement worth flagging:

- **Suppression-aware DMV aggregation** (S2.3) requires the per-quarter sum to include all 21 counties before being published, otherwise the aggregate would silently mis-mix quarters. The plan's `countByDate === DMV_COUNTIES.length` guard implements the design's "Suppression handling" decision at the aggregate layer (the design only described it at the per-county layer). This is a strict implementation of the same principle, not a deviation.

## Next
**Phase:** Implement
**Artifact to review:** `docs/crispy/qcew-federal-employment/5-plan.md`
**Action:** Review structure and key decisions — this is a spot-check document. Then invoke `crispy-implement` with project name `qcew-federal-employment`.
