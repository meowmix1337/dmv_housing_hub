import type { Cadence, Observation } from '@dmv/shared';

/**
 * Every ingester implements this interface. The runner reads a registry
 * of DataSource instances and calls fetch() on the requested ones.
 */
export interface DataSource {
  readonly name: string;
  readonly cadence: Cadence;
  fetch(): Promise<Observation[]>;
}

export interface IngestResult {
  source: string;
  observations: Observation[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}
