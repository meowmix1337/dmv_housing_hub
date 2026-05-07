/**
 * Census ACS 5-year ingester. Pulls B19013 (median household income),
 * B25077 (median home value), B25064 (median gross rent) for each
 * DMV county.
 *
 * STATUS: stub — implement per DATA_SOURCES.md §3 in step 9 of PROJECT_SPEC.
 *
 * Implementation hints:
 *   - Endpoint: GET https://api.census.gov/data/{year}/acs/acs5
 *               ?get=NAME,B19013_001E,B25077_001E,B25064_001E
 *               &for=county:{countyFips}&in=state:{stateFips}&key={KEY}
 *   - For DC, query for=county:001&in=state:11
 *   - The response is a 2D array; first row is column headers.
 *   - Census returns "-666666666" or null for unavailable values; filter these.
 *   - Use the latest available 5-year ACS year; check Census for new releases each December.
 */

import type { Observation } from '@dmv/shared';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';

export class CensusSource implements DataSource {
  readonly name = 'census';
  readonly cadence = 'annual' as const;

  async fetch(): Promise<Observation[]> {
    throw new IngestError('CensusSource not yet implemented', { source: 'census' });
  }
}
