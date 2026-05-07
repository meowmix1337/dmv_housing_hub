import type { Jurisdiction } from '@dmv/shared';

export interface County {
  fips: string;
  name: string;
  shortName: string;
  jurisdiction: Jurisdiction;
  isIndependentCity?: boolean;
  /** State FIPS prefix (used for Census API queries) */
  stateFips: '11' | '24' | '51';
  /** County portion of FIPS (last 3 digits) */
  countyFips: string;
}

export const DMV_COUNTIES: readonly County[] = [
  // District of Columbia (state FIPS 11)
  {
    fips: '11001',
    name: 'District of Columbia',
    shortName: 'DC',
    jurisdiction: 'DC',
    stateFips: '11',
    countyFips: '001',
  },

  // Maryland (state FIPS 24)
  {
    fips: '24003',
    name: 'Anne Arundel County',
    shortName: 'Anne Arundel',
    jurisdiction: 'MD',
    stateFips: '24',
    countyFips: '003',
  },
  {
    fips: '24005',
    name: 'Baltimore County',
    shortName: 'Baltimore Co.',
    jurisdiction: 'MD',
    stateFips: '24',
    countyFips: '005',
  },
  {
    fips: '24009',
    name: 'Calvert County',
    shortName: 'Calvert',
    jurisdiction: 'MD',
    stateFips: '24',
    countyFips: '009',
  },
  {
    fips: '24017',
    name: 'Charles County',
    shortName: 'Charles',
    jurisdiction: 'MD',
    stateFips: '24',
    countyFips: '017',
  },
  {
    fips: '24021',
    name: 'Frederick County',
    shortName: 'Frederick',
    jurisdiction: 'MD',
    stateFips: '24',
    countyFips: '021',
  },
  {
    fips: '24027',
    name: 'Howard County',
    shortName: 'Howard',
    jurisdiction: 'MD',
    stateFips: '24',
    countyFips: '027',
  },
  {
    fips: '24031',
    name: 'Montgomery County',
    shortName: 'Montgomery',
    jurisdiction: 'MD',
    stateFips: '24',
    countyFips: '031',
  },
  {
    fips: '24033',
    name: "Prince George's County",
    shortName: "Prince George's",
    jurisdiction: 'MD',
    stateFips: '24',
    countyFips: '033',
  },
  {
    fips: '24510',
    name: 'Baltimore city',
    shortName: 'Baltimore City',
    jurisdiction: 'MD',
    isIndependentCity: true,
    stateFips: '24',
    countyFips: '510',
  },

  // Virginia (state FIPS 51)
  {
    fips: '51013',
    name: 'Arlington County',
    shortName: 'Arlington',
    jurisdiction: 'VA',
    stateFips: '51',
    countyFips: '013',
  },
  {
    fips: '51059',
    name: 'Fairfax County',
    shortName: 'Fairfax',
    jurisdiction: 'VA',
    stateFips: '51',
    countyFips: '059',
  },
  {
    fips: '51107',
    name: 'Loudoun County',
    shortName: 'Loudoun',
    jurisdiction: 'VA',
    stateFips: '51',
    countyFips: '107',
  },
  {
    fips: '51153',
    name: 'Prince William County',
    shortName: 'Prince William',
    jurisdiction: 'VA',
    stateFips: '51',
    countyFips: '153',
  },
  {
    fips: '51177',
    name: 'Spotsylvania County',
    shortName: 'Spotsylvania',
    jurisdiction: 'VA',
    stateFips: '51',
    countyFips: '177',
  },
  {
    fips: '51179',
    name: 'Stafford County',
    shortName: 'Stafford',
    jurisdiction: 'VA',
    stateFips: '51',
    countyFips: '179',
  },
  {
    fips: '51510',
    name: 'Alexandria city',
    shortName: 'Alexandria',
    jurisdiction: 'VA',
    isIndependentCity: true,
    stateFips: '51',
    countyFips: '510',
  },
  {
    fips: '51600',
    name: 'Fairfax city',
    shortName: 'Fairfax City',
    jurisdiction: 'VA',
    isIndependentCity: true,
    stateFips: '51',
    countyFips: '600',
  },
  {
    fips: '51610',
    name: 'Falls Church city',
    shortName: 'Falls Church',
    jurisdiction: 'VA',
    isIndependentCity: true,
    stateFips: '51',
    countyFips: '610',
  },
  {
    fips: '51683',
    name: 'Manassas city',
    shortName: 'Manassas',
    jurisdiction: 'VA',
    isIndependentCity: true,
    stateFips: '51',
    countyFips: '683',
  },
  {
    fips: '51685',
    name: 'Manassas Park city',
    shortName: 'Manassas Park',
    jurisdiction: 'VA',
    isIndependentCity: true,
    stateFips: '51',
    countyFips: '685',
  },
] as const;

export const FIPS_BY_ID: ReadonlyMap<string, County> = new Map(
  DMV_COUNTIES.map((c) => [c.fips, c]),
);

export function getCounty(fips: string): County {
  const c = FIPS_BY_ID.get(fips);
  if (!c) {
    throw new Error(`Unknown FIPS: ${fips}`);
  }
  return c;
}

export function countiesByJurisdiction(j: Jurisdiction): readonly County[] {
  return DMV_COUNTIES.filter((c) => c.jurisdiction === j);
}
