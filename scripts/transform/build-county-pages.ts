import 'dotenv/config';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  CountySeries,
  CountySummary,
  Manifest,
  ManifestSourceEntry,
  MetricPoint,
  Observation,
} from '@dmv/shared';
import { log } from '../lib/log.js';
import { readJson, writeJsonAtomic, ensureDir } from '../lib/storage.js';
import {
  CACHE_DIR,
  COUNTIES_DIR,
  MANIFEST_PATH,
  METRICS_DIR,
} from '../lib/paths.js';
import { DMV_COUNTIES } from '../lib/counties.js';

// Validate only the metadata envelope — not the observations array.
// Zod's array parse recurses per-element and overflows the call stack on large caches (e.g. 160K redfin rows).
// Observations were already validated at ingest time.
const CachedRunMetaSchema = z.object({
  source: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number(),
  count: z.number(),
});

interface CachedRun {
  source: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  count: number;
  observations: Observation[];
}

const SOURCES = ['fred', 'census', 'bls', 'zillow', 'redfin'] as const;

async function loadAllObservations(): Promise<{
  observations: Observation[];
  manifest: ManifestSourceEntry[];
}> {
  // Collect per-source arrays and flat() at the end — spreading 160K+ items as function
  // arguments (push(...arr)) overflows the JS call stack.
  const chunks: Observation[][] = [];
  const manifest: ManifestSourceEntry[] = [];

  for (const source of SOURCES) {
    const path = join(CACHE_DIR, `${source}.json`);
    try {
      const raw = await readJson<Record<string, unknown>>(path);
      const meta = CachedRunMetaSchema.parse(raw);
      const cached: CachedRun = { ...meta, observations: (raw.observations ?? []) as Observation[] };
      chunks.push(cached.observations);
      manifest.push({
        name: source,
        lastUpdated: cached.finishedAt,
        cadence: cadenceFor(source),
        status: 'ok',
      });
      log.info({ source, count: cached.observations.length }, 'loaded cache');
    } catch (err) {
      log.warn({ source, err: errMessage(err) }, 'no cache for source; skipping');
      manifest.push({
        name: source,
        lastUpdated: new Date(0).toISOString(),
        cadence: cadenceFor(source),
        status: 'stale',
      });
    }
  }

  const observations = chunks.flat();

  // For Redfin, sort all_residential before property-type-specific rows so the dedup below
  // keeps the aggregate series rather than an arbitrary property type.
  observations.sort((a, b) => {
    if (a.source !== 'redfin' || b.source !== 'redfin') return 0;
    const aIsAll = a.series.endsWith(':all_residential') ? 0 : 1;
    const bIsAll = b.series.endsWith(':all_residential') ? 0 : 1;
    return aIsAll - bIsAll;
  });

  // Deduplicate by (source, fips, metric, observedAt), keeping the first occurrence.
  // This collapses Zillow county-row duplicates and Redfin property-type rows (keeping all_residential above).
  const seen = new Set<string>();
  const deduplicated = observations.filter((o) => {
    const key = `${o.source}:${o.fips}:${o.metric}:${o.observedAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduplicated.length !== observations.length) {
    log.warn({ dropped: observations.length - deduplicated.length }, 'deduplicated observations');
  }

  return { observations: deduplicated, manifest };
}

function cadenceFor(source: string): ManifestSourceEntry['cadence'] {
  switch (source) {
    case 'fred':
      return 'monthly';
    case 'census':
      return 'annual';
    case 'bls':
      return 'monthly';
    case 'zillow':
      return 'monthly';
    case 'redfin':
      return 'weekly';
    default:
      return 'monthly';
  }
}

function toMetricPoints(observations: Observation[]): MetricPoint[] {
  return observations
    .map((o) => ({ date: o.observedAt, value: o.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildCountySummary(
  fips: string,
  observations: Observation[],
  generatedAt: string,
): CountySummary {
  const county = DMV_COUNTIES.find((c) => c.fips === fips);
  if (!county) {
    throw new Error(`unknown FIPS in buildCountySummary: ${fips}`);
  }

  const forCounty = observations.filter((o) => o.fips === fips);

  const fhfaHpiObs = forCounty.filter((o) => o.metric === 'fhfa_hpi');
  const zhviObs = forCounty.filter((o) => o.metric === 'zhvi_all_homes');
  const medianSaleObs = forCounty.filter((o) => o.metric === 'median_sale_price');
  const domObs = forCounty.filter((o) => o.metric === 'days_on_market');
  const activeObs = forCounty.filter((o) => o.metric === 'active_listings');
  const monthsSupplyObs = forCounty.filter((o) => o.metric === 'months_supply');
  const unemploymentObs = forCounty.filter((o) => o.metric === 'unemployment_rate');
  const saleToListObs = forCounty.filter((o) => o.metric === 'sale_to_list_ratio');
  const pctAboveListObs = forCounty.filter((o) => o.metric === 'pct_sold_above_list');
  const incomeObs = forCounty.filter((o) => o.metric === 'median_household_income');

  const series: CountySeries = {};
  if (fhfaHpiObs.length) series.fhfaHpi = toMetricPoints(fhfaHpiObs);
  if (zhviObs.length) series.zhvi = toMetricPoints(zhviObs);
  if (medianSaleObs.length) series.medianSalePrice = toMetricPoints(medianSaleObs);
  if (domObs.length) series.daysOnMarket = toMetricPoints(domObs);
  if (activeObs.length) series.activeListings = toMetricPoints(activeObs);

  const summary: CountySummary = {
    fips: county.fips,
    name: county.name,
    jurisdiction: county.jurisdiction,
    lastUpdated: generatedAt,
    current: {},
    series,
  };

  // Derive current snapshot from latest points
  const latestZhvi = series.zhvi?.at(-1);
  if (latestZhvi) {
    summary.current.zhvi = latestZhvi.value;
    // findLast: series is sorted ascending, so we want the last point <= yearAgo
    const yearAgo = series.zhvi?.findLast(
      (p: MetricPoint) => p.date <= isoYearAgo(latestZhvi.date),
    );
    if (yearAgo) {
      summary.current.zhviYoY = (latestZhvi.value - yearAgo.value) / yearAgo.value;
    }
  }

  const latestMedian = series.medianSalePrice?.at(-1);
  if (latestMedian) {
    summary.current.medianSalePrice = latestMedian.value;
    const yearAgo = series.medianSalePrice?.findLast(
      (p: MetricPoint) => p.date <= isoYearAgo(latestMedian.date),
    );
    if (yearAgo) {
      summary.current.medianSalePriceYoY =
        (latestMedian.value - yearAgo.value) / yearAgo.value;
    }
  }

  const latestDom = series.daysOnMarket?.at(-1);
  if (latestDom) {
    summary.current.daysOnMarket = latestDom.value;
  }

  if (monthsSupplyObs.length) {
    summary.current.monthsSupply = toMetricPoints(monthsSupplyObs).at(-1)?.value;
  }

  if (unemploymentObs.length) {
    summary.current.unemploymentRate = toMetricPoints(unemploymentObs).at(-1)?.value;
  }

  if (saleToListObs.length) {
    summary.current.saleToListRatio = toMetricPoints(saleToListObs).at(-1)?.value;
  }

  if (pctAboveListObs.length) {
    summary.current.pctSoldAboveList = toMetricPoints(pctAboveListObs).at(-1)?.value;
  }

  if (incomeObs.length) {
    summary.medianHouseholdIncome = toMetricPoints(incomeObs).at(-1)?.value;
  }

  return summary;
}

function isoYearAgo(date: string): string {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const { observations, manifest } = await loadAllObservations();

  if (observations.length === 0) {
    log.error('no observations loaded; run ingest first');
    process.exit(1);
  }

  await ensureDir(COUNTIES_DIR);
  await ensureDir(METRICS_DIR);

  for (const county of DMV_COUNTIES) {
    const summary = buildCountySummary(county.fips, observations, generatedAt);
    const path = join(COUNTIES_DIR, `${county.fips}.json`);
    await writeJsonAtomic(path, summary);
    log.info({ fips: county.fips, name: county.name, path }, 'wrote county summary');
  }

  // National mortgage rate metric series
  const mortgageObs = observations.filter(
    (o) => o.metric === 'mortgage_30y_rate' && o.fips === 'USA',
  );
  if (mortgageObs.length) {
    await writeJsonAtomic(join(METRICS_DIR, 'mortgage-rates.json'), {
      metric: 'mortgage_30y_rate',
      fips: 'USA',
      unit: 'percent',
      cadence: 'weekly',
      source: 'fred',
      lastUpdated: generatedAt,
      points: toMetricPoints(mortgageObs),
    });
  }

  const finalManifest: Manifest = { generatedAt, sources: manifest };
  await writeJsonAtomic(MANIFEST_PATH, finalManifest);
  log.info({ counties: DMV_COUNTIES.length }, 'transform complete');
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

main().catch((err) => {
  log.fatal({ err: errMessage(err) }, 'unhandled error in build-county-pages');
  process.exit(1);
});
