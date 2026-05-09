import { describe, expect, it } from 'vitest';
import {
  parseQcewCsv,
  quarterToObservedAt,
  rowToObservation,
  runWithConcurrency,
  selectFederalCountyTotal,
  type QcewRow,
} from './qcew.js';

function makeRow(overrides: Partial<QcewRow>): QcewRow {
  return {
    area_fips: '11001',
    own_code: '1',
    industry_code: '10',
    agglvl_code: '71',
    year: '2024',
    qtr: '1',
    disclosure_code: '',
    month3_emplvl: '192845',
    ...overrides,
  };
}

describe('quarterToObservedAt', () => {
  it('maps Q1 to March 1', () => {
    expect(quarterToObservedAt(2024, 1)).toBe('2024-03-01');
  });

  it('maps Q4 to December 1', () => {
    expect(quarterToObservedAt(2024, 4)).toBe('2024-12-01');
  });
});

describe('parseQcewCsv + selectFederalCountyTotal', () => {
  it('returns the single matching row out of a multi-row fixture', () => {
    const csv = [
      '"area_fips","own_code","industry_code","agglvl_code","year","qtr","disclosure_code","month3_emplvl"',
      '"11001","1","10","71","2024","1","","192845"',
      '"11001","5","10","71","2024","1","","50000"',
      '"11001","1","10","70","2024","1","","100000"',
      '"11001","1","101","74","2024","1","","30000"',
    ].join('\n');

    const rows = parseQcewCsv(csv);
    expect(rows).toHaveLength(4);

    const selected = selectFederalCountyTotal(rows);
    expect(selected).not.toBeNull();
    expect(selected?.own_code).toBe('1');
    expect(selected?.industry_code).toBe('10');
    expect(selected?.agglvl_code).toBe('71');
    expect(selected?.month3_emplvl).toBe('192845');
  });

  it('returns null when no matching row exists', () => {
    const csv = [
      '"area_fips","own_code","industry_code","agglvl_code","year","qtr","disclosure_code","month3_emplvl"',
      '"11001","5","10","71","2024","1","","50000"',
    ].join('\n');
    const rows = parseQcewCsv(csv);
    expect(selectFederalCountyTotal(rows)).toBeNull();
  });
});

describe('rowToObservation', () => {
  it('returns an Observation for a disclosed row', () => {
    const row = makeRow({});
    const obs = rowToObservation(row, '11001');
    expect(obs).not.toBeNull();
    expect(obs).toEqual({
      source: 'qcew',
      series: 'qcew:11001:2024Q1:own1:naics10',
      fips: '11001',
      metric: 'federal_employment',
      observedAt: '2024-03-01',
      value: 192845,
      unit: 'count',
    });
  });

  it('returns null for suppressed rows (disclosure_code=N)', () => {
    const row = makeRow({ disclosure_code: 'N' });
    expect(rowToObservation(row, '11001')).toBeNull();
  });

  it('returns null for non-finite month3_emplvl', () => {
    const row = makeRow({ month3_emplvl: 'not-a-number' });
    expect(rowToObservation(row, '11001')).toBeNull();
  });
});

describe('runWithConcurrency', () => {
  it('preserves input order in results and respects the concurrency limit', async () => {
    const items = [10, 20, 30, 40, 50, 60, 70, 80];
    const limit = 3;
    let active = 0;
    let maxActive = 0;

    const results = await runWithConcurrency(items, limit, async (n) => {
      active++;
      if (active > maxActive) maxActive = active;
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return n * 2;
    });

    expect(results).toEqual([20, 40, 60, 80, 100, 120, 140, 160]);
    expect(maxActive).toBeLessThanOrEqual(limit);
  });
});
