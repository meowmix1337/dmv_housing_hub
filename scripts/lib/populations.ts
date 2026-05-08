import { join } from 'node:path';
import { readJson } from './storage.js';
import { log } from './log.js';
import { CACHE_DIR } from './paths.js';
import type { Observation } from '@dmv/shared';

interface CensusCache {
  observations: Observation[];
}

export async function getPopulationByFips(): Promise<Record<string, number>> {
  try {
    const raw = await readJson<CensusCache>(join(CACHE_DIR, 'census.json'));
    const obs = raw.observations ?? [];
    const result: Record<string, number> = {};
    for (const o of obs) {
      if (o.metric === 'population' && o.fips && o.value != null) {
        // Keep the most recent vintage per FIPS (observations sorted ascending by the transform)
        result[o.fips] = o.value;
      }
    }
    if (Object.keys(result).length === 0) {
      log.warn('no population observations found in census cache; skipping population field');
    }
    return result;
  } catch {
    log.warn('could not read census cache for population; skipping population field');
    return {};
  }
}
