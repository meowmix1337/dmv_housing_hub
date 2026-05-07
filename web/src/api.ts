import type { CountySummary, Manifest, MetricSeries } from '@dmv/shared';

const BASE = '/data';

class ApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiError(res.status, url, `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function getCountySummary(fips: string): Promise<CountySummary> {
  return getJson<CountySummary>(`/counties/${fips}.json`);
}

export function getMetricSeries(metric: string): Promise<MetricSeries> {
  return getJson<MetricSeries>(`/metrics/${metric}.json`);
}

export function getManifest(): Promise<Manifest> {
  return getJson<Manifest>('/manifest.json');
}

export { ApiError };
