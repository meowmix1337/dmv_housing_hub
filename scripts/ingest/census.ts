import { z } from 'zod';
import type { MetricId, Observation, Unit } from '@dmv/shared';
import { fetchJson } from '../lib/http.js';
import { log } from '../lib/log.js';
import { IngestError } from '../lib/errors.js';
import { DMV_COUNTIES } from '../lib/counties.js';
import type { DataSource } from './DataSource.js';

const ACS_YEAR = 2023;
const BASE_URL = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5`;
const OBSERVED_AT = `${ACS_YEAR}-01-01`;
const SENTINEL = '-666666666';

interface VariableSpec {
  variable: string;
  metric: MetricId;
  unit: Unit;
}

const VARIABLES: readonly VariableSpec[] = [
  { variable: 'B19013_001E', metric: 'median_household_income', unit: 'USD' },
  { variable: 'B25077_001E', metric: 'median_home_value', unit: 'USD' },
  { variable: 'B25064_001E', metric: 'median_gross_rent', unit: 'USD' },
];

const CensusResponseSchema = z.array(z.array(z.string().nullable()));

function getApiKey(): string {
  const key = process.env.CENSUS_API_KEY;
  if (!key) {
    throw new IngestError('CENSUS_API_KEY not set in environment', { source: 'census' });
  }
  return key;
}

function buildDmvFipsSet(): Set<string> {
  return new Set(DMV_COUNTIES.map((c) => c.fips));
}

/**
 * Parse a raw Census ACS 2D-array response into Observations.
 * Exported for unit testing without HTTP mocking.
 */
export function parseRows(raw: unknown, dmvFipsSet: Set<string>): Observation[] {
  const rows = CensusResponseSchema.parse(raw);
  if (rows.length < 2) return [];

  const header = rows[0];
  if (!header) return [];

  const colIndex = new Map<string, number>();
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (h !== null && h !== undefined) colIndex.set(h, i);
  }

  const stateCol = colIndex.get('state');
  const countyCol = colIndex.get('county');
  if (stateCol === undefined || countyCol === undefined) {
    throw new IngestError('Census response missing state/county columns', { source: 'census' });
  }

  const variableCols = VARIABLES.map((spec) => ({
    spec,
    col: colIndex.get(spec.variable),
  }));

  for (const { spec, col } of variableCols) {
    if (col === undefined) {
      log.warn({ variable: spec.variable }, 'census: variable column absent from response headers');
    }
  }

  const minRequiredLen =
    Math.max(stateCol, countyCol, ...variableCols.map((v) => v.col ?? -1)) + 1;

  const all: Observation[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    if (row.length < minRequiredLen) {
      log.warn({ rowIndex: i, rowLength: row.length }, 'census: row too short; skipping');
      continue;
    }

    const stateFips = row[stateCol];
    const countyFips = row[countyCol];
    if (!stateFips || !countyFips) continue;

    const fips = `${stateFips.padStart(2, '0')}${countyFips.padStart(3, '0')}`;
    if (!dmvFipsSet.has(fips)) continue;

    for (const { spec, col } of variableCols) {
      if (col === undefined) continue;

      const cell = row[col];
      if (cell === null || cell === SENTINEL) {
        log.warn({ fips, variable: spec.variable }, 'census: missing value; skipping observation');
        continue;
      }

      const num = Number(cell);
      if (!Number.isFinite(num)) {
        log.warn({ fips, variable: spec.variable, cell }, 'census: non-numeric value; skipping observation');
        continue;
      }

      all.push({
        source: 'census',
        series: spec.variable,
        fips,
        metric: spec.metric,
        observedAt: OBSERVED_AT,
        value: num,
        unit: spec.unit,
      });
    }
  }

  return all;
}

async function fetchStateGroup(
  stateFips: string,
  countyParam: string,
  apiKey: string,
): Promise<unknown> {
  const variableList = VARIABLES.map((v) => v.variable).join(',');
  const url =
    `${BASE_URL}?get=NAME,${variableList}` +
    `&for=county:${countyParam}&in=state:${stateFips}&key=${apiKey}`;

  try {
    return await fetchJson(url, { label: `census:state:${stateFips}` });
  } catch (err) {
    throw new IngestError(
      `Census fetch failed for state ${stateFips}`,
      { source: 'census' },
      err,
    );
  }
}

export class CensusSource implements DataSource {
  readonly name = 'census';
  readonly cadence = 'annual' as const;

  async fetch(): Promise<Observation[]> {
    const apiKey = getApiKey();
    const dmvFipsSet = buildDmvFipsSet();

    const stateGroups: Array<{ stateFips: string; countyParam: string }> = [
      { stateFips: '11', countyParam: '001' },
      { stateFips: '24', countyParam: '*' },
      { stateFips: '51', countyParam: '*' },
    ];

    const all: Observation[] = [];

    for (const { stateFips, countyParam } of stateGroups) {
      log.info({ stateFips }, 'census: fetching state group');
      try {
        const raw = await fetchStateGroup(stateFips, countyParam, apiKey);
        const obs = parseRows(raw, dmvFipsSet);
        all.push(...obs);
        log.info({ stateFips, count: obs.length }, 'census: state group done');
      } catch (err) {
        const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
        log.error(
          { stateFips, err: errMessage(err), cause },
          'census: state group failed; continuing',
        );
      }
    }

    return all;
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
