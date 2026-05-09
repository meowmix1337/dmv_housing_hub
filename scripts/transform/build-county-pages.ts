import 'dotenv/config';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  ActiveListingsBreakdown,
  ActiveListingsByType,
  ActiveListingsDmv,
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
import { PROPERTY_TAX_RATES } from '../lib/property-tax-rates.js';
import { getPopulationByFips } from '../lib/populations.js';
import { marketHealthScore } from './marketHealth.js';
import { affordabilityIndex } from './affordability.js';

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

const SOURCES = ['fred', 'census', 'bls', 'zillow', 'redfin', 'qcew'] as const;

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
  // keeps the aggregate series for non-breakdown metrics.
  observations.sort((a, b) => {
    if (a.source !== 'redfin' || b.source !== 'redfin') return 0;
    const aIsAll = a.series.endsWith(':all_residential') ? 0 : 1;
    const bIsAll = b.series.endsWith(':all_residential') ? 0 : 1;
    return aIsAll - bIsAll;
  });

  // Dedupe by (source, fips, metric, observedAt). Redfin's `active_listings` is
  // exempt — we additionally key on `series` so all four property-type rows
  // survive (consumed by buildActiveListingsBreakdown). Every other Redfin
  // metric collapses to a single `all_residential` row per date thanks to the
  // sort above.
  const seen = new Set<string>();
  const deduplicated = observations.filter((o) => {
    const key = o.source === 'redfin' && o.metric === 'active_listings'
      ? `${o.source}:${o.series}:${o.fips}:${o.metric}:${o.observedAt}`
      : `${o.source}:${o.fips}:${o.metric}:${o.observedAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduplicated.length !== observations.length) {
    log.warn({ dropped: observations.length - deduplicated.length }, 'deduplicated observations');
  }

  return { observations: deduplicated, manifest };
}

const PROPERTY_TYPES = ['single_family', 'condo', 'townhouse', 'multi_family'] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * Property types that gate emission of a date. Single-family, condo, and
 * townhouse are present in essentially every county/month combination Redfin
 * reports; multi-family is intermittent (rural counties often have no
 * multi-family activity at all). Treat missing multi-family rows as zero
 * rather than skipping the whole month.
 */
const REQUIRED_TYPES = ['single_family', 'condo', 'townhouse'] as const;

/**
 * Build a per-property-type active-listings breakdown for one county.
 * Total at each date = SFH + condo + townhouse + multi_family. Multi-family
 * defaults to 0 when Redfin omits the row (equivalent to "zero listings of
 * that type that month"). Dates where any required type is missing are
 * dropped.
 */
export function buildActiveListingsBreakdown(
  forCounty: Observation[],
): ActiveListingsBreakdown | undefined {
  const valuesByDate: Record<PropertyType, Map<string, number>> = {
    single_family: new Map(), condo: new Map(),
    townhouse: new Map(), multi_family: new Map(),
  };
  for (const t of PROPERTY_TYPES) {
    const seriesId = `redfin:county:${t}`;
    for (const o of forCounty) {
      if (o.metric === 'active_listings' && o.series === seriesId) {
        valuesByDate[t].set(o.observedAt, o.value);
      }
    }
  }

  const dateSet = new Set<string>();
  for (const t of PROPERTY_TYPES) for (const d of valuesByDate[t].keys()) dateSet.add(d);
  const fullDates = [...dateSet]
    .sort()
    .filter((d) => REQUIRED_TYPES.every((t) => valuesByDate[t].has(d)));
  if (fullDates.length === 0) return undefined;

  const total: MetricPoint[] = [];
  const byType: ActiveListingsByType = {
    single_family: [], condo: [], townhouse: [], multi_family: [],
  };
  for (const date of fullDates) {
    let sum = 0;
    for (const t of PROPERTY_TYPES) {
      const v = valuesByDate[t].get(date) ?? 0;
      byType[t].push({ date, value: v });
      sum += v;
    }
    total.push({ date, value: sum });
  }
  return { total, byType };
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
    case 'qcew':
      return 'quarterly';
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
  mortgageRate: number | undefined,
  populationByFips: Record<string, number>,
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
  const monthsSupplyObs = forCounty.filter((o) => o.metric === 'months_supply');
  const unemploymentObs = forCounty.filter((o) => o.metric === 'unemployment_rate');
  const saleToListObs = forCounty.filter((o) => o.metric === 'sale_to_list_ratio');
  const pctAboveListObs = forCounty.filter((o) => o.metric === 'pct_sold_above_list');
  const incomeObs = forCounty.filter((o) => o.metric === 'median_household_income');
  const fedObs = forCounty.filter(
    (o) => o.metric === 'federal_employment' && o.source === 'qcew',
  );

  const series: CountySeries = {};
  if (fhfaHpiObs.length) series.fhfaHpi = toMetricPoints(fhfaHpiObs);
  if (zhviObs.length) series.zhvi = toMetricPoints(zhviObs);
  if (medianSaleObs.length) series.medianSalePrice = toMetricPoints(medianSaleObs);
  if (domObs.length) series.daysOnMarket = toMetricPoints(domObs);
  const activeListings = buildActiveListingsBreakdown(forCounty);
  if (activeListings) series.activeListings = activeListings;

  // Inventory YoY off the breakdown's `total` series; surfaced on `current`
  // for the County page Market Health card and as a 4th composite input.
  let inventoryYoY: number | undefined;
  if (activeListings) {
    const last = activeListings.total.at(-1);
    if (last) {
      const yearAgo = activeListings.total.findLast(
        (p: MetricPoint) => p.date <= isoYearAgo(last.date),
      );
      if (yearAgo && yearAgo.value > 0) {
        inventoryYoY = (last.value - yearAgo.value) / yearAgo.value;
      }
    }
  }

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

  // Property tax rate (static lookup)
  const taxRate = PROPERTY_TAX_RATES[fips];
  if (taxRate !== undefined) {
    summary.propertyTaxRate = taxRate;
  } else {
    log.warn({ fips }, 'no property tax rate for FIPS; skipping');
  }

  // Population from census cache (when available)
  const pop = populationByFips[fips];
  if (pop !== undefined) {
    summary.population = pop;
  }

  if (activeListings) {
    const latest = activeListings.total.at(-1);
    if (latest) summary.current.activeListings = latest.value;
    if (inventoryYoY !== undefined) summary.current.activeListingsYoY = inventoryYoY;
  }

  // Market health score
  const mhs = marketHealthScore({
    monthsSupply: summary.current.monthsSupply,
    saleToListRatio: summary.current.saleToListRatio,
    pctSoldAboveList: summary.current.pctSoldAboveList,
    inventoryYoY,
  });
  if (mhs !== undefined) {
    summary.current.marketHealthScore = mhs;
  } else {
    log.warn({ fips }, 'insufficient inputs for marketHealthScore; skipping');
  }

  // Affordability index
  if (mortgageRate !== undefined) {
    const ai = affordabilityIndex({
      medianSalePrice: summary.current.medianSalePrice,
      propertyTaxRate: taxRate,
      medianHouseholdIncome: summary.medianHouseholdIncome,
      mortgageRate,
    });
    if (ai !== undefined) {
      summary.current.affordabilityIndex = ai;
    } else {
      log.warn({ fips }, 'insufficient inputs for affordabilityIndex; skipping');
    }
  } else {
    log.warn({ fips }, 'no mortgage rate available for affordabilityIndex; skipping');
  }

  return summary;
}

function isoYearAgo(date: string): string {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

interface MortgageRatesFile {
  points: MetricPoint[];
}

async function loadLatestMortgageRate(): Promise<number | undefined> {
  try {
    const raw = await readJson<MortgageRatesFile>(join(METRICS_DIR, 'mortgage-rates.json'));
    const latest = raw.points?.at(-1);
    if (latest?.value == null) return undefined;
    // FRED stores as percent (e.g., 6.23); convert to decimal
    return latest.value / 100;
  } catch {
    log.warn('no mortgage-rates.json yet; affordabilityIndex will be skipped');
    return undefined;
  }
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

  // Write mortgage rates first so loadLatestMortgageRate can read them on re-runs;
  // on first run the file won't exist yet and affordability is skipped.
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

  const [mortgageRate, populationByFips] = await Promise.all([
    loadLatestMortgageRate(),
    getPopulationByFips(),
  ]);

  for (const county of DMV_COUNTIES) {
    const summary = buildCountySummary(county.fips, observations, generatedAt, mortgageRate, populationByFips);
    const path = join(COUNTIES_DIR, `${county.fips}.json`);
    await writeJsonAtomic(path, summary);
    log.info({ fips: county.fips, name: county.name, path }, 'wrote county summary');
  }

  const fedAll = observations.filter(
    (o) => o.metric === 'federal_employment' && o.source === 'qcew',
  );
  if (fedAll.length) {
    const byDate = new Map<string, number>();
    const countByDate = new Map<string, number>();
    for (const o of fedAll) {
      if (!DMV_COUNTIES.some((c) => c.fips === o.fips)) continue;
      byDate.set(o.observedAt, (byDate.get(o.observedAt) ?? 0) + o.value);
      countByDate.set(o.observedAt, (countByDate.get(o.observedAt) ?? 0) + 1);
    }
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

  // DMV-wide active-listings aggregate (Redfin). Sum each property type across
  // every covered DMV county; emit a month only when every covered county
  // reports for that month (matches the federal-employment "all-or-skip" rule).
  // Counties with very sparse breakdown coverage (e.g. Spotsylvania, 20 months
  // out of 171) are excluded from `covered` so they don't gate the regional
  // series; their absence is documented in `coverage.missing`.
  const COVERAGE_RATIO_THRESHOLD = 0.95;
  const perCountyRaw = new Map<string, ActiveListingsBreakdown>();
  for (const c of DMV_COUNTIES) {
    const forCounty = observations.filter((o) => o.fips === c.fips);
    const b = buildActiveListingsBreakdown(forCounty);
    if (b) perCountyRaw.set(c.fips, b);
  }
  const maxLen = Math.max(0, ...[...perCountyRaw.values()].map((b) => b.total.length));
  const perCountyBreakdown = new Map(
    [...perCountyRaw.entries()].filter(
      ([, b]) => b.total.length >= maxLen * COVERAGE_RATIO_THRESHOLD,
    ),
  );
  if (perCountyBreakdown.size > 0) {
    const covered = [...perCountyBreakdown.keys()].sort();
    const missing = DMV_COUNTIES.filter((c) => !perCountyBreakdown.has(c.fips)).map((c) => c.fips);
    const dateCount = new Map<string, number>();
    for (const b of perCountyBreakdown.values()) {
      for (const p of b.total) dateCount.set(p.date, (dateCount.get(p.date) ?? 0) + 1);
    }
    const fullDates = [...dateCount.entries()]
      .filter(([, n]) => n === covered.length)
      .map(([d]) => d)
      .sort();

    const seriesTotal: MetricPoint[] = [];
    const seriesByType: ActiveListingsByType = {
      single_family: [], condo: [], townhouse: [], multi_family: [],
    };
    for (const date of fullDates) {
      let sum = 0;
      const byTypeSum: Record<keyof ActiveListingsByType, number> = {
        single_family: 0, condo: 0, townhouse: 0, multi_family: 0,
      };
      for (const fips of covered) {
        const b = perCountyBreakdown.get(fips)!;
        sum += b.total.find((p) => p.date === date)!.value;
        for (const t of PROPERTY_TYPES) {
          byTypeSum[t] += b.byType[t].find((p) => p.date === date)!.value;
        }
      }
      seriesTotal.push({ date, value: sum });
      for (const t of PROPERTY_TYPES) seriesByType[t].push({ date, value: byTypeSum[t] });
    }

    if (seriesTotal.length > 0) {
      const last = seriesTotal.at(-1)!;
      const yearAgo = seriesTotal.findLast((p) => p.date <= isoYearAgo(last.date));
      const latestYoY =
        yearAgo && yearAgo.value > 0 ? (last.value - yearAgo.value) / yearAgo.value : undefined;
      const file: ActiveListingsDmv = {
        metric: 'active_listings',
        fips: 'DMV',
        unit: 'count',
        cadence: 'monthly',
        source: 'redfin',
        lastUpdated: generatedAt,
        asOf: last.date,
        latest: {
          total: last.value,
          byType: {
            single_family: seriesByType.single_family.at(-1)!.value,
            condo: seriesByType.condo.at(-1)!.value,
            townhouse: seriesByType.townhouse.at(-1)!.value,
            multi_family: seriesByType.multi_family.at(-1)!.value,
          },
        },
        latestYoY,
        series: { total: seriesTotal, byType: seriesByType },
        coverage: { fips: covered, missing },
      };
      await writeJsonAtomic(join(METRICS_DIR, 'active-listings-dmv.json'), file);
    } else {
      log.warn('no fully-covered DMV months; skipping active-listings-dmv.json');
    }
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
