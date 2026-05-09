import { describe, it, expect } from 'vitest';
import type { Observation } from '@dmv/shared';
import { buildActiveListingsBreakdown } from './build-county-pages.js';

function obs(series: string, observedAt: string, value: number): Observation {
  return {
    source: 'redfin',
    series,
    fips: '11001',
    metric: 'active_listings',
    observedAt,
    value,
    unit: 'count',
  };
}

describe('buildActiveListingsBreakdown', () => {
  it('emits total = sum of four property types when all present', () => {
    const o = [
      obs('redfin:county:single_family', '2024-01-31', 100),
      obs('redfin:county:condo', '2024-01-31', 50),
      obs('redfin:county:townhouse', '2024-01-31', 30),
      obs('redfin:county:multi_family', '2024-01-31', 10),
    ];
    const r = buildActiveListingsBreakdown(o);
    expect(r?.total).toEqual([{ date: '2024-01-31', value: 190 }]);
    expect(r?.byType.single_family).toEqual([{ date: '2024-01-31', value: 100 }]);
    expect(r?.byType.multi_family).toEqual([{ date: '2024-01-31', value: 10 }]);
  });

  it('drops dates where any required type (SFH/condo/townhouse) is missing', () => {
    const o = [
      // Jan: townhouse missing — drop
      obs('redfin:county:single_family', '2024-01-31', 100),
      obs('redfin:county:condo', '2024-01-31', 50),
      obs('redfin:county:multi_family', '2024-01-31', 10),
      // Feb: all required types report
      obs('redfin:county:single_family', '2024-02-29', 110),
      obs('redfin:county:condo', '2024-02-29', 55),
      obs('redfin:county:townhouse', '2024-02-29', 33),
      obs('redfin:county:multi_family', '2024-02-29', 11),
    ];
    const r = buildActiveListingsBreakdown(o);
    expect(r?.total).toEqual([{ date: '2024-02-29', value: 209 }]);
  });

  it('treats missing multi_family as zero (multi-family is intermittent at the county level)', () => {
    const o = [
      obs('redfin:county:single_family', '2024-01-31', 100),
      obs('redfin:county:condo', '2024-01-31', 50),
      obs('redfin:county:townhouse', '2024-01-31', 30),
      // multi_family omitted — Redfin convention for "zero listings"
    ];
    const r = buildActiveListingsBreakdown(o);
    expect(r?.total).toEqual([{ date: '2024-01-31', value: 180 }]);
    expect(r?.byType.multi_family).toEqual([{ date: '2024-01-31', value: 0 }]);
  });

  it('returns undefined when no date has all required types', () => {
    const o = [
      obs('redfin:county:single_family', '2024-01-31', 100),
      obs('redfin:county:condo', '2024-01-31', 50),
      // townhouse missing
    ];
    const r = buildActiveListingsBreakdown(o);
    expect(r).toBeUndefined();
  });

  it('emits dates in chronological order', () => {
    const o = [
      obs('redfin:county:single_family', '2024-02-29', 110),
      obs('redfin:county:condo', '2024-02-29', 55),
      obs('redfin:county:townhouse', '2024-02-29', 33),
      obs('redfin:county:multi_family', '2024-02-29', 11),
      obs('redfin:county:single_family', '2024-01-31', 100),
      obs('redfin:county:condo', '2024-01-31', 50),
      obs('redfin:county:townhouse', '2024-01-31', 30),
      obs('redfin:county:multi_family', '2024-01-31', 10),
    ];
    const r = buildActiveListingsBreakdown(o);
    expect(r?.total.map((p) => p.date)).toEqual(['2024-01-31', '2024-02-29']);
  });

  it('ignores all_residential rows (sum-of-types is canonical)', () => {
    const o = [
      obs('redfin:county:all_residential', '2024-01-31', 999),
      obs('redfin:county:single_family', '2024-01-31', 100),
      obs('redfin:county:condo', '2024-01-31', 50),
      obs('redfin:county:townhouse', '2024-01-31', 30),
      obs('redfin:county:multi_family', '2024-01-31', 10),
    ];
    const r = buildActiveListingsBreakdown(o);
    expect(r?.total).toEqual([{ date: '2024-01-31', value: 190 }]);
  });
});
