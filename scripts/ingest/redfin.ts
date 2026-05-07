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
  if (row['period_duration'] !== '7') return [];
  if (row['region_type'] !== 'county') return [];

  const stateCode = row['state_code'] ?? '';
  if (!DMV_STATE_CODES.has(stateCode)) return [];
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

  const propertyType = row['property_type'] ?? '';
  const slug = PROPERTY_TYPE_SLUGS[propertyType];
  if (!slug) {
    log.warn({ property_type: propertyType }, 'redfin: unknown property type; skipping');
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
