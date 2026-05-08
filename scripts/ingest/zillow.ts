import type { MetricId, Observation, Unit } from '@dmv/shared';
import { parse } from 'csv-parse/sync';
import type { DataSource } from './DataSource.js';
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
