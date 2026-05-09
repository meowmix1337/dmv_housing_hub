import { parse } from 'csv-parse/sync';
import type { Observation } from '@dmv/shared';
import { fetchText } from '../lib/http.js';
import { log } from '../lib/log.js';
import { HttpError, IngestError } from '../lib/errors.js';
import { DMV_COUNTIES } from '../lib/counties.js';
import type { DataSource } from './DataSource.js';

const QCEW_BASE = 'https://data.bls.gov/cew/data/api';
const START_YEAR = 2015;
const QUARTERS = [1, 2, 3, 4] as const;
const CONCURRENCY = 4;

export interface QcewRow {
  area_fips: string;
  own_code: string;
  industry_code: string;
  agglvl_code: string;
  year: string;
  qtr: string;
  disclosure_code: string;
  month3_emplvl: string;
}

export function parseQcewCsv(csv: string): QcewRow[] {
  return parse(csv, { columns: true, skip_empty_lines: true }) as QcewRow[];
}

export function selectFederalCountyTotal(rows: QcewRow[]): QcewRow | null {
  for (const row of rows) {
    if (row.own_code === '1' && row.agglvl_code === '71' && row.industry_code === '10') {
      return row;
    }
  }
  return null;
}

export function quarterToObservedAt(year: number, qtr: 1 | 2 | 3 | 4): string {
  const suffix = qtr === 1 ? '03-01' : qtr === 2 ? '06-01' : qtr === 3 ? '09-01' : '12-01';
  return `${year}-${suffix}`;
}

export function rowToObservation(row: QcewRow, fips: string): Observation | null {
  if (row.disclosure_code === 'N') {
    log.warn({ fips, year: row.year, qtr: row.qtr }, 'qcew: suppressed; skipping');
    return null;
  }
  const emplvl = Number(row.month3_emplvl);
  if (!Number.isFinite(emplvl)) {
    log.warn({ fips, year: row.year, qtr: row.qtr, value: row.month3_emplvl }, 'qcew: non-finite value; skipping');
    return null;
  }
  const qtr = Number(row.qtr) as 1 | 2 | 3 | 4;
  const series = `qcew:${fips}:${row.year}Q${row.qtr}:own1:naics10`;
  return {
    source: 'qcew',
    series,
    fips,
    metric: 'federal_employment',
    observedAt: quarterToObservedAt(Number(row.year), qtr),
    value: emplvl,
    unit: 'count',
  };
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      const item = items[i] as T;
      results[i] = await fn(item);
    }
  }

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(limit, items.length);
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

interface FetchTask {
  fips: string;
  year: number;
  qtr: 1 | 2 | 3 | 4;
}

export class QcewSource implements DataSource {
  readonly name = 'qcew';
  readonly cadence = 'quarterly' as const;

  async fetch(): Promise<Observation[]> {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;
    const currentQuarter = Math.ceil(currentMonth / 3) as 1 | 2 | 3 | 4;

    const tasks: FetchTask[] = [];
    for (let year = START_YEAR; year <= currentYear; year++) {
      for (const qtr of QUARTERS) {
        if (year === currentYear && qtr > currentQuarter) continue;
        for (const county of DMV_COUNTIES) {
          tasks.push({ fips: county.fips, year, qtr });
        }
      }
    }

    log.info({ count: tasks.length }, 'qcew: starting fetch');

    const results = await runWithConcurrency(tasks, CONCURRENCY, async (task) => {
      const url = `${QCEW_BASE}/${task.year}/${task.qtr}/area/${task.fips}.csv`;
      const label = `qcew:${task.fips}:${task.year}Q${task.qtr}`;
      try {
        const csv = await fetchText(url, { label });
        const rows = parseQcewCsv(csv);
        const row = selectFederalCountyTotal(rows);
        if (!row) {
          log.warn({ fips: task.fips, year: task.year, qtr: task.qtr }, 'qcew: federal county total row not found; skipping');
          return null;
        }
        return rowToObservation(row, task.fips);
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) {
          log.warn({ fips: task.fips, year: task.year, qtr: task.qtr }, 'qcew: 404 (data not yet published); skipping');
          return null;
        }
        throw new IngestError(
          `qcew fetch failed for ${task.fips} ${task.year}Q${task.qtr}`,
          { source: 'qcew', fips: task.fips, url },
          err,
        );
      }
    });

    const observations: Observation[] = [];
    for (const r of results) {
      if (r !== null) observations.push(r);
    }

    log.info({ count: observations.length }, 'qcew: fetch complete');
    return observations;
  }
}
