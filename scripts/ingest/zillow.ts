/**
 * Zillow Research ingester. Downloads ZHVI (typical home value) and ZORI
 * (rent index) CSVs and transposes from wide to long format.
 *
 * STATUS: stub — implement per DATA_SOURCES.md §5 in step 9 of PROJECT_SPEC.
 *
 * Implementation hints:
 *   - Files are CSV in WIDE format: one row per geography, one column per month.
 *   - Filter to StateName in {"District of Columbia", "Maryland", "Virginia"}.
 *   - Zillow does not include FIPS — resolve RegionName → FIPS via DMV_COUNTIES.
 *   - Independent VA cities sometimes have " (City)" suffix in some files.
 *   - URLs may change; scrape the data page on first run and cache the discovery.
 *   - Use csv-parse for streaming over the multi-MB files.
 *
 * Files of interest:
 *   - County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv  (all-homes mid-tier)
 *   - County_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv       (SFH only)
 *   - County_zhvi_uc_condo_tier_0.33_0.67_sm_sa_month.csv     (condo)
 *   - County_zori_uc_sfrcondomfr_sm_sa_month.csv              (rent)
 */

import type { MetricId, Observation, Unit } from '@dmv/shared';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';
import { DMV_COUNTIES } from '../lib/counties.js';
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
    throw new IngestError('ZillowSource not yet implemented', { source: 'zillow' });
  }
}
