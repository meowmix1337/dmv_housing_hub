import { describe, expect, it } from 'vitest';
import { buildFipsIndex, parseRow } from './zillow.js';
import type { FileSpec } from './zillow.js';

describe('buildFipsIndex', () => {
  it('maps "montgomery county" to 24031', () => {
    const idx = buildFipsIndex();
    expect(idx.get('montgomery county')).toBe('24031');
  });

  it('maps "district of columbia" to 11001', () => {
    const idx = buildFipsIndex();
    expect(idx.get('district of columbia')).toBe('11001');
  });

  it('maps "prince george\'s county" to 24033', () => {
    const idx = buildFipsIndex();
    expect(idx.get("prince george's county")).toBe('24033');
  });

  it('maps "alexandria city" to 51510 (full lowercase name)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('alexandria city')).toBe('51510');
  });

  it('maps "alexandria" to 51510 (stripped city suffix)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('alexandria')).toBe('51510');
  });

  it('maps "falls church city" to 51610 (full name)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('falls church city')).toBe('51610');
  });

  it('maps "falls church" to 51610 (stripped suffix)', () => {
    const idx = buildFipsIndex();
    expect(idx.get('falls church')).toBe('51610');
  });
});

const COUNTY_SPEC: FileSpec = {
  url: 'https://example.com/County_zhvi_all.csv',
  metric: 'zhvi_all_homes',
  unit: 'USD',
  scope: 'county',
};

function baseCountyRow(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    RegionID: '3101',
    SizeRank: '1',
    RegionName: 'Montgomery County',
    RegionType: 'county',
    StateName: 'Maryland',
    State: 'MD',
    Metro: 'Washington, DC',
    StateCodeFIPS: '24',
    MunicipalCodeFIPS: '031',
    '2023-11-30': '',
    '2023-12-31': '550000',
    '2024-01-31': '555000',
    ...overrides,
  };
}

describe('parseRow - county scope', () => {
  const fipsIndex = buildFipsIndex();

  it('skips rows with out-of-DMV StateName', () => {
    const row = baseCountyRow({ StateName: 'California', RegionName: 'Los Angeles County' });
    expect(parseRow(row, COUNTY_SPEC, fipsIndex)).toHaveLength(0);
  });

  it('skips rows where RegionName is not in the DMV county list', () => {
    const row = baseCountyRow({ RegionName: 'Some Unknown County', StateName: 'Virginia' });
    expect(parseRow(row, COUNTY_SPEC, fipsIndex)).toHaveLength(0);
  });

  it('returns two observations for a valid row with one blank and two filled date columns', () => {
    const obs = parseRow(baseCountyRow(), COUNTY_SPEC, fipsIndex);
    expect(obs).toHaveLength(2);
  });

  it('emits correct observation shape for the first valid date', () => {
    const obs = parseRow(baseCountyRow(), COUNTY_SPEC, fipsIndex);
    const first = obs[0];
    expect(first).toBeDefined();
    expect(first).toMatchObject({
      source: 'zillow',
      series: 'zillow:county:zhvi_all_homes',
      fips: '24031',
      metric: 'zhvi_all_homes',
      observedAt: '2023-12-31',
      value: 550000,
      unit: 'USD',
    });
  });

  it('skips non-numeric values in date columns', () => {
    const row = baseCountyRow({ '2023-12-31': 'N/A', '2024-01-31': '555000' });
    const obs = parseRow(row, COUNTY_SPEC, fipsIndex);
    expect(obs).toHaveLength(1);
    const first = obs[0];
    expect(first).toBeDefined();
    expect(first?.value).toBe(555000);
  });

  it('ignores non-date columns', () => {
    const row = baseCountyRow();
    const obs = parseRow(row, COUNTY_SPEC, fipsIndex);
    // Only date-pattern columns should produce observations
    for (const o of obs) {
      expect(o.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('resolves "District of Columbia" (StateName) to fips 11001', () => {
    const row = baseCountyRow({
      RegionName: 'District of Columbia',
      StateName: 'District of Columbia',
    });
    const obs = parseRow(row, COUNTY_SPEC, fipsIndex);
    expect(obs.length).toBeGreaterThan(0);
    const first = obs[0];
    expect(first).toBeDefined();
    expect(first?.fips).toBe('11001');
    expect(first?.series).toBe('zillow:county:zhvi_all_homes');
  });
});

const METRO_SPEC: FileSpec = {
  url: 'https://example.com/Metro_zhvi_all.csv',
  metric: 'zhvi_all_homes',
  unit: 'USD',
  scope: 'metro',
};

function baseMetroRow(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    RegionID: '102001',
    SizeRank: '4',
    RegionName: 'Washington, DC',
    RegionType: 'msa',
    StateName: 'DC',
    '2024-01-31': '620000',
    '2024-02-29': '625000',
    ...overrides,
  };
}

describe('parseRow - metro scope', () => {
  const fipsIndex = buildFipsIndex();

  it('skips non-DC metro rows', () => {
    const row = baseMetroRow({ RegionName: 'Chicago, IL' });
    expect(parseRow(row, METRO_SPEC, fipsIndex)).toHaveLength(0);
  });

  it('skips non-DC metro rows regardless of StateName', () => {
    const row = baseMetroRow({ RegionName: 'New York, NY', StateName: 'NY' });
    expect(parseRow(row, METRO_SPEC, fipsIndex)).toHaveLength(0);
  });

  it('matches "Washington, DC" and assigns fips 47900', () => {
    const obs = parseRow(baseMetroRow(), METRO_SPEC, fipsIndex);
    expect(obs.length).toBeGreaterThan(0);
    expect(obs[0]).toMatchObject({
      source: 'zillow',
      series: 'zillow:metro:zhvi_all_homes',
      fips: '47900',
      metric: 'zhvi_all_homes',
      observedAt: '2024-01-31',
      value: 620000,
      unit: 'USD',
    });
  });

  it('emits one observation per filled date column', () => {
    const obs = parseRow(baseMetroRow(), METRO_SPEC, fipsIndex);
    expect(obs).toHaveLength(2);
  });
});
