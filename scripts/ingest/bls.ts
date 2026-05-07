/**
 * BLS ingester. Pulls LAUS county unemployment rates and CES federal
 * employment for the Washington-Arlington-Alexandria MSA.
 *
 * STATUS: stub — implement per DATA_SOURCES.md §4 in step 9 of PROJECT_SPEC.
 *
 * Implementation hints:
 *   - POST https://api.bls.gov/publicAPI/v2/timeseries/data/
 *   - Body: { seriesid: [...], startyear: "2015", endyear: "2026", registrationkey: "..." }
 *   - Up to 50 series per request with key.
 *   - LAUS county unemployment rate: LAUCN{FIPS}0000000003
 *   - DMV federal employment series: SMU11479009091000001 (Washington-Arlington-Alexandria MSA federal)
 *   - period like "M01" — convert to ISO "YYYY-MM-01"; filter out "M13" annual averages.
 */

import type { Observation } from '@dmv/shared';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';

export class BlsSource implements DataSource {
  readonly name = 'bls';
  readonly cadence = 'monthly' as const;

  async fetch(): Promise<Observation[]> {
    throw new IngestError('BlsSource not yet implemented', { source: 'bls' });
  }
}
