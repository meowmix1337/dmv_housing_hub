import { describe, expect, it } from 'vitest';
import { DMV_COUNTIES, FIPS_BY_ID, getCounty, countiesByJurisdiction } from './counties.js';

describe('DMV_COUNTIES', () => {
  it('has 21 jurisdictions total', () => {
    expect(DMV_COUNTIES).toHaveLength(21);
  });

  it('has exactly 1 DC', () => {
    expect(countiesByJurisdiction('DC')).toHaveLength(1);
  });

  it('has 9 MD jurisdictions', () => {
    expect(countiesByJurisdiction('MD')).toHaveLength(9);
  });

  it('has 11 VA jurisdictions', () => {
    expect(countiesByJurisdiction('VA')).toHaveLength(11);
  });

  it('all FIPS are unique 5-digit strings', () => {
    const seen = new Set<string>();
    for (const c of DMV_COUNTIES) {
      expect(c.fips).toMatch(/^\d{5}$/);
      expect(seen.has(c.fips)).toBe(false);
      seen.add(c.fips);
    }
  });

  it('stateFips matches first two chars of fips', () => {
    for (const c of DMV_COUNTIES) {
      expect(c.fips.slice(0, 2)).toBe(c.stateFips);
      expect(c.fips.slice(2)).toBe(c.countyFips);
    }
  });
});

describe('FIPS_BY_ID', () => {
  it('looks up Montgomery County by FIPS', () => {
    const c = FIPS_BY_ID.get('24031');
    expect(c?.name).toBe('Montgomery County');
  });

  it('returns undefined for unknown FIPS', () => {
    expect(FIPS_BY_ID.get('00000')).toBeUndefined();
  });
});

describe('getCounty', () => {
  it('returns the county for a known FIPS', () => {
    expect(getCounty('51059').shortName).toBe('Fairfax');
  });

  it('throws for unknown FIPS', () => {
    expect(() => getCounty('00000')).toThrow(/Unknown FIPS/);
  });
});
