/**
 * Redfin Data Center weekly TSV ingester.
 *
 * STATUS: stub — implement per DATA_SOURCES.md §6 in step 9 of PROJECT_SPEC.
 * This is the most involved ingester; defer until FRED + Census + Zillow
 * are landed and you have a working end-to-end pipeline.
 *
 * Implementation hints:
 *   - URL: https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/
 *          county_market_tracker.tsv000.gz
 *   - File is large (~7M rows nationally). Stream and gunzip; filter
 *     state_code IN ('DC','MD','VA') early to bound memory.
 *   - Multiple property_type rows per (region, period); keep all but tag.
 *   - period_duration in days; weekly = 7, monthly = 30.
 *   - Some columns are decimals (e.g., 0.027 = 2.7%); normalize.
 *   - Redfin revises prior-week numbers; ingest must overwrite, not append.
 *   - Required: cite Redfin and link back per their data license.
 */

import type { Observation } from '@dmv/shared';
import type { DataSource } from './DataSource.js';
import { IngestError } from '../lib/errors.js';

export class RedfinSource implements DataSource {
  readonly name = 'redfin';
  readonly cadence = 'weekly' as const;

  async fetch(): Promise<Observation[]> {
    throw new IngestError('RedfinSource not yet implemented', { source: 'redfin' });
  }
}
