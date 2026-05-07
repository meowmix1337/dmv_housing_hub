import { z } from 'zod';
import type { MetricId, Observation, Unit } from '@dmv/shared';
import { fetchJson } from '../lib/http.js';
import { log } from '../lib/log.js';
import { IngestError } from '../lib/errors.js';
import { DMV_COUNTIES } from '../lib/counties.js';
import type { DataSource } from './DataSource.js';

const BASE_URL = 'https://api.stlouisfed.org/fred';

const FredObservationSchema = z.object({
  date: z.string(),
  value: z.string(),
});

const FredResponseSchema = z.object({
  observations: z.array(FredObservationSchema),
});

interface SeriesSpec {
  /** Either a literal series ID, or a function that builds one from county FIPS */
  seriesId: string | ((fips: string) => string);
  metric: MetricId;
  unit: Unit;
  /** "USA" → emit as a national series; "state" → use state FIPS; "county" → loop counties */
  scope: 'national' | 'state' | 'county';
}

const SERIES: readonly SeriesSpec[] = [
  // National
  { seriesId: 'MORTGAGE30US', metric: 'mortgage_30y_rate', unit: 'percent', scope: 'national' },
  { seriesId: 'MORTGAGE15US', metric: 'mortgage_15y_rate', unit: 'percent', scope: 'national' },

  // State-level FHFA HPI
  { seriesId: 'DCSTHPI', metric: 'fhfa_hpi', unit: 'index_other', scope: 'state' },
  { seriesId: 'MDSTHPI', metric: 'fhfa_hpi', unit: 'index_other', scope: 'state' },
  { seriesId: 'VASTHPI', metric: 'fhfa_hpi', unit: 'index_other', scope: 'state' },

  // County-level FHFA HPI: ATNHPIUS{FIPS}A
  {
    seriesId: (fips) => `ATNHPIUS${fips}A`,
    metric: 'fhfa_hpi',
    unit: 'index_other',
    scope: 'county',
  },

  // Realtor.com via FRED — county-level hotness score
  {
    seriesId: (fips) => `HOSCCOUNTY${fips}`,
    metric: 'hotness_score',
    unit: 'index_other',
    scope: 'county',
  },

  // Realtor.com — county median listing price
  {
    seriesId: (fips) => `MELIPRCOUNTY${fips}`,
    metric: 'median_list_price',
    unit: 'USD',
    scope: 'county',
  },
];

/** Map state-level series ID → state FIPS (for the `fips` field on observations) */
const STATE_SERIES_TO_FIPS: Record<string, string> = {
  DCSTHPI: '11',
  MDSTHPI: '24',
  VASTHPI: '51',
};

function getApiKey(): string {
  const key = process.env.FRED_API_KEY;
  if (!key) {
    throw new IngestError('FRED_API_KEY not set in environment', { source: 'fred' });
  }
  return key;
}

async function fetchSeries(seriesId: string): Promise<{ date: string; value: string }[]> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json`;

  try {
    const raw = await fetchJson(url, { label: `fred:${seriesId}` });
    const parsed = FredResponseSchema.parse(raw);
    return parsed.observations;
  } catch (err) {
    throw new IngestError(`failed to fetch FRED series ${seriesId}`, { source: 'fred', series: seriesId }, err);
  }
}

function toObservations(
  rawObs: { date: string; value: string }[],
  spec: SeriesSpec,
  fips: string,
  series: string,
): Observation[] {
  const out: Observation[] = [];
  for (const o of rawObs) {
    // FRED uses "." for missing values
    if (o.value === '.' || o.value === '') continue;
    const num = Number(o.value);
    if (!Number.isFinite(num)) continue;
    out.push({
      source: 'fred',
      series,
      fips,
      metric: spec.metric,
      observedAt: o.date,
      value: num,
      unit: spec.unit,
    });
  }
  return out;
}

export class FredSource implements DataSource {
  readonly name = 'fred';
  readonly cadence = 'monthly' as const; // mixed cadences; "monthly" represents the run cadence

  async fetch(): Promise<Observation[]> {
    const all: Observation[] = [];

    for (const spec of SERIES) {
      if (spec.scope === 'national') {
        const id = typeof spec.seriesId === 'string' ? spec.seriesId : spec.seriesId('USA');
        log.info({ series: id }, 'fetching FRED national series');
        try {
          const rawObs = await fetchSeries(id);
          all.push(...toObservations(rawObs, spec, 'USA', id));
        } catch (err) {
          log.error({ series: id, err: errMessage(err) }, 'national series failed; continuing');
        }
        continue;
      }

      if (spec.scope === 'state') {
        if (typeof spec.seriesId !== 'string') {
          log.warn({ spec }, 'state series with function ID is not supported; skipping');
          continue;
        }
        const id = spec.seriesId;
        const fips = STATE_SERIES_TO_FIPS[id];
        if (!fips) {
          log.warn({ id }, 'unknown state series; skipping');
          continue;
        }
        log.info({ series: id, fips }, 'fetching FRED state series');
        try {
          const rawObs = await fetchSeries(id);
          all.push(...toObservations(rawObs, spec, fips, id));
        } catch (err) {
          log.error({ series: id, err: errMessage(err) }, 'state series failed; continuing');
        }
        continue;
      }

      // county scope
      if (typeof spec.seriesId !== 'function') {
        log.warn({ spec }, 'county scope must use function seriesId; skipping');
        continue;
      }
      const builder = spec.seriesId;

      for (const county of DMV_COUNTIES) {
        const id = builder(county.fips);
        try {
          const rawObs = await fetchSeries(id);
          const obs = toObservations(rawObs, spec, county.fips, id);
          all.push(...obs);
          log.info({ series: id, fips: county.fips, count: obs.length }, 'fetched');
        } catch (err) {
          // Some county series don't exist for every county; warn but continue
          log.warn(
            { series: id, fips: county.fips, err: errMessage(err) },
            'county series failed; continuing',
          );
        }
        // Stay well under FRED's 120 req/min limit
        await sleep(600);
      }
    }

    return all;
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
