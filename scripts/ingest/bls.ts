import { z } from 'zod';
import type { MetricId, Observation, Unit } from '@dmv/shared';
import { fetchWithRetry } from '../lib/http.js';
import { log } from '../lib/log.js';
import { IngestError } from '../lib/errors.js';
import { DMV_COUNTIES } from '../lib/counties.js';
import type { DataSource } from './DataSource.js';

const BLS_API_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const START_YEAR = '2015';
const END_YEAR = '2026';

const MSA_FEDERAL_SERIES = 'SMU11479009091000001';
const MSA_FEDERAL_FIPS = '11-metro';

const BlsDataPointSchema = z.object({
  year: z.string(),
  period: z.string(),
  value: z.string(),
  footnotes: z.array(z.unknown()).optional(),
});

const BlsSeriesSchema = z.object({
  seriesID: z.string(),
  data: z.array(BlsDataPointSchema),
});

const BlsResponseSchema = z.object({
  status: z.string(),
  message: z.array(z.string()).optional(),
  Results: z
    .object({
      series: z.array(BlsSeriesSchema),
    })
    .optional(),
});

interface SeriesMeta {
  fips: string;
  metric: MetricId;
  unit: Unit;
}

/** Convert BLS year + period code to ISO date string, or null for M13 (annual average). */
export function periodToIso(year: string, period: string): string | null {
  if (period === 'M13') return null;
  const month = period.slice(1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function buildSeriesMeta(): Map<string, SeriesMeta> {
  const meta = new Map<string, SeriesMeta>();
  for (const c of DMV_COUNTIES) {
    meta.set(`LAUCN${c.fips}0000000003`, {
      fips: c.fips,
      metric: 'unemployment_rate',
      unit: 'percent',
    });
  }
  meta.set(MSA_FEDERAL_SERIES, {
    fips: MSA_FEDERAL_FIPS,
    metric: 'federal_employment',
    unit: 'count',
  });
  return meta;
}

/**
 * Parse a raw BLS API response into Observations.
 * Exported for unit testing without HTTP mocking.
 * Logs a warn for each requested series absent from the response.
 */
export function parseBlsResponse(
  raw: unknown,
  seriesMeta: Map<string, SeriesMeta>,
): Observation[] {
  const parsed = BlsResponseSchema.parse(raw);

  if (parsed.status !== 'REQUEST_SUCCEEDED') {
    const msg = parsed.message?.join('; ') ?? 'unknown error';
    throw new IngestError(`BLS request failed: ${msg}`, { source: 'bls' });
  }

  const series = parsed.Results?.series ?? [];
  const receivedIds = new Set(series.map((s) => s.seriesID));

  for (const id of seriesMeta.keys()) {
    if (!receivedIds.has(id)) {
      log.warn({ series: id }, 'bls: series absent from response');
    }
  }

  const all: Observation[] = [];

  for (const s of series) {
    const meta = seriesMeta.get(s.seriesID);
    if (!meta) {
      log.warn({ series: s.seriesID }, 'bls: unexpected series in response; skipping');
      continue;
    }

    let seriesCount = 0;
    for (const point of s.data) {
      const observedAt = periodToIso(point.year, point.period);
      if (observedAt === null) continue;

      const num = Number(point.value);
      if (!Number.isFinite(num)) continue;

      all.push({
        source: 'bls',
        series: s.seriesID,
        fips: meta.fips,
        metric: meta.metric,
        observedAt,
        value: num,
        unit: meta.unit,
      });
      seriesCount++;
    }

    log.info({ series: s.seriesID, fips: meta.fips, count: seriesCount }, 'bls: parsed series');
  }

  return all;
}

function getApiKey(): string {
  const key = process.env.BLS_API_KEY;
  if (!key) {
    throw new IngestError('BLS_API_KEY not set in environment', { source: 'bls' });
  }
  return key;
}

export class BlsSource implements DataSource {
  readonly name = 'bls';
  readonly cadence = 'monthly' as const;

  async fetch(): Promise<Observation[]> {
    const registrationkey = getApiKey();
    const seriesMeta = buildSeriesMeta();
    const allSeriesIds = [...seriesMeta.keys()];

    log.info({ count: allSeriesIds.length }, 'bls: posting batch request');

    const body = JSON.stringify({
      seriesid: allSeriesIds,
      startyear: START_YEAR,
      endyear: END_YEAR,
      registrationkey,
    });

    let raw: unknown;
    try {
      const res = await fetchWithRetry(BLS_API_URL, {
        label: 'bls:batch',
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      });
      raw = await res.json();
    } catch (err) {
      throw new IngestError('BLS batch request failed', { source: 'bls' }, err);
    }

    const observations = parseBlsResponse(raw, seriesMeta);
    log.info({ count: observations.length }, 'bls: fetch complete');
    return observations;
  }
}
