/**
 * Zillow Research ingester. Downloads ZHVI (typical home value) and ZORI
 * (rent index) CSVs and transposes from wide to long format.
 *
 * STATUS: stub — implement per DATA_SOURCES.md §5 in step 9 of PROJECT_SPEC.
 *
 * Implementation hints:
 *   - Files are CSV in WIDE format: one row per geography, one column per month.
 *   - Filter to StateName in {"District of Columbia", "Maryland", "Virginia"}.
 *   - Zillow does not include FIPS — resolve RegionName → FIPS via DMV_COUNTIES.
 *   - Independent VA cities sometimes have " (City)" suffix in some files.
 *   - URLs may change; scrape the data page on first run and cache the discovery.
 *   - Use csv-parse for streaming over the multi-MB files.
 *
 * Files of interest:
 *   - County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv  (all-homes mid-tier)
 *   - County_zhvi_uc_sfr_tier_0.33_0.67_sm_sa_month.csv       (SFH only)
 *   - County_zhvi_uc_condo_tier_0.33_0.67_sm_sa_month.csv     (condo)
 *   - County_zori_uc_sfrcondomfr_sm_sa_month.csv              (rent)
 */

import type { Observation } from '@dmv/shared';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';

export class ZillowSource implements DataSource {
  readonly name = 'zillow';
  readonly cadence = 'monthly' as const;

  async fetch(): Promise<Observation[]> {
    throw new IngestError('ZillowSource not yet implemented', { source: 'zillow' });
  }
}
