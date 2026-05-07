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
  MEDIAN_SALE_PRICE: { metric: 'median_sale_price', unit: 'USD' },
  MEDIAN_LIST_PRICE: { metric: 'median_list_price', unit: 'USD' },
  MEDIAN_PPSF: { metric: 'median_price_per_sqft', unit: 'USD_per_sqft' },
  HOMES_SOLD: { metric: 'homes_sold', unit: 'count' },
  NEW_LISTINGS: { metric: 'new_listings', unit: 'count' },
  INVENTORY: { metric: 'active_listings', unit: 'count' },
  MONTHS_OF_SUPPLY: { metric: 'months_supply', unit: 'months' },
  MEDIAN_DOM: { metric: 'days_on_market', unit: 'days' },
  AVG_SALE_TO_LIST: { metric: 'sale_to_list_ratio', unit: 'ratio' },
  SOLD_ABOVE_LIST: { metric: 'pct_sold_above_list', unit: 'percent' },
  PRICE_DROPS: { metric: 'pct_price_drops', unit: 'percent' },
};

const PROPERTY_TYPE_SLUGS: Readonly<Record<string, string>> = {
  'All Residential': 'all_residential',
  'Single Family Residential': 'single_family',
  'Condo/Co-op': 'condo',
  Townhouse: 'townhouse',
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
  if (row['PERIOD_DURATION'] !== '7') return [];
  if (row['REGION_TYPE'] !== 'county') return [];

  const stateCode = row['STATE_CODE'] ?? '';
  if (!DMV_STATE_CODES.has(stateCode)) return [];
  const regionRaw = row['REGION'] ?? '';
  const suffix = `, ${stateCode}`;
  const countyName = (
    regionRaw.endsWith(suffix) ? regionRaw.slice(0, -suffix.length) : regionRaw
  ).toLowerCase();

  const fips = fipsIndex.get(countyName);
  if (!fips) {
    log.warn({ region: row['REGION'], state_code: stateCode }, 'redfin: unresolved FIPS; skipping');
    return [];
  }

  const propertyType = row['PROPERTY_TYPE'] ?? '';
  const slug = PROPERTY_TYPE_SLUGS[propertyType];
  if (!slug) {
    log.warn({ property_type: propertyType }, 'redfin: unrecognized property type; skipping');
    return [];
  }

  const observedAt = row['PERIOD_END'];
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
