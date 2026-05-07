import { describe, it, expect } from 'vitest';
import { parseRows } from './census.js';

const DMV_FIPS_SET = new Set(['11001', '24031', '51013']);

const VALID_FIXTURE: (string | null)[][] = [
  ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
  ['Montgomery County, Maryland', '120000', '550000', '1800', '24', '031'],
  ['District of Columbia', '95000', '680000', '1600', '11', '001'],
  ['Arlington County, Virginia', '115000', '620000', '1900', '51', '013'],
];

describe('parseRows', () => {
  it('returns correct observations for a valid fixture', () => {
    const result = parseRows(VALID_FIXTURE, DMV_FIPS_SET);
    // 3 counties × 3 variables = 9 observations
    expect(result).toHaveLength(9);

    const mc = result.find((o) => o.fips === '24031' && o.metric === 'median_household_income');
    expect(mc).toBeDefined();
    expect(mc!.value).toBe(120000);
    expect(mc!.unit).toBe('USD');
    expect(mc!.source).toBe('census');
    expect(mc!.series).toBe('B19013_001E');
    expect(mc!.observedAt).toBe('2023-01-01'); // tied to ACS_YEAR = 2023 in census.ts; update when bumped
  });

  it('filters sentinel "-666666666" cells and keeps other cells in the same row', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
      ['Montgomery County, Maryland', '-666666666', '550000', '1800', '24', '031'],
    ];
    const result = parseRows(fixture, DMV_FIPS_SET);
    expect(result).toHaveLength(2); // B25077 + B25064 only
    expect(result.find((o) => o.metric === 'median_household_income')).toBeUndefined();
    expect(result.find((o) => o.metric === 'median_home_value')).toBeDefined();
  });

  it('filters null cells and keeps other cells in the same row', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
      ['Montgomery County, Maryland', null, '550000', '1800', '24', '031'],
    ];
    const result = parseRows(fixture, DMV_FIPS_SET);
    expect(result).toHaveLength(2);
    expect(result.find((o) => o.metric === 'median_household_income')).toBeUndefined();
  });

  it('skips cells that are non-numeric strings and keeps other cells in the same row', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
      ['Montgomery County, Maryland', '(X)', '550000', '1800', '24', '031'],
    ];
    const result = parseRows(fixture, DMV_FIPS_SET);
    expect(result).toHaveLength(2);
    expect(result.find((o) => o.metric === 'median_household_income')).toBeUndefined();
  });

  it('silently skips non-DMV county rows', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
      ['Some Other County, Maryland', '80000', '300000', '1200', '24', '999'],
      ['Montgomery County, Maryland', '120000', '550000', '1800', '24', '031'],
    ];
    const result = parseRows(fixture, DMV_FIPS_SET);
    expect(result).toHaveLength(3); // Montgomery only (3 variables)
    expect(result.every((o) => o.fips === '24031')).toBe(true);
  });

  it('warns and skips malformed rows without throwing', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
      ['bad'], // too few columns
      ['Montgomery County, Maryland', '120000', '550000', '1800', '24', '031'],
    ];
    let result: ReturnType<typeof parseRows> = [];
    expect(() => { result = parseRows(fixture, DMV_FIPS_SET); }).not.toThrow();
    expect(result).toHaveLength(3); // Montgomery only
  });

  it('returns an empty array when the response has no data rows', () => {
    const fixture: (string | null)[][] = [
      ['NAME', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
    ];
    expect(parseRows(fixture, DMV_FIPS_SET)).toHaveLength(0);
  });

  it('returns an empty array for a completely empty response', () => {
    expect(parseRows([], DMV_FIPS_SET)).toHaveLength(0);
  });
});
