import type { MetricId } from '@dmv/shared';

export interface SourceCitation {
  source: 'fred' | 'census' | 'bls' | 'qcew' | 'zillow' | 'redfin';
  /** Short form rendered as "Source: <label>". */
  label: string;
  /** Upstream landing page or download URL. */
  url: string;
  /** Optional methodology/whitepaper URL for derivative-work citation. */
  methodologyUrl?: string;
}

/**
 * One entry per MetricId so any chart/value rendered in the UI can look up
 * its canonical citation (and link to the upstream source) without each
 * component hard-coding a literal string. Keep in sync with
 * DATA_SOURCES.md when adding a new metric.
 */
export const CITATIONS: Partial<Record<MetricId, SourceCitation>> = {
  fhfa_hpi: {
    source: 'fred',
    label: 'FHFA All-Transactions HPI · via FRED',
    url: 'https://fred.stlouisfed.org/series/ATNHPIUS11001A',
    methodologyUrl: 'https://www.fhfa.gov/data/hpi',
  },
  zhvi_all_homes: {
    source: 'zillow',
    label: 'Zillow Research, ZHVI (All Homes, Smoothed, SA)',
    url: 'https://www.zillow.com/research/data/',
    methodologyUrl: 'https://www.zillow.com/research/zhvi-methodology/',
  },
  zhvi_sfh: {
    source: 'zillow',
    label: 'Zillow Research, ZHVI (Single-Family, Smoothed, SA)',
    url: 'https://www.zillow.com/research/data/',
  },
  zhvi_condo: {
    source: 'zillow',
    label: 'Zillow Research, ZHVI (Condo/Co-op, Smoothed, SA)',
    url: 'https://www.zillow.com/research/data/',
  },
  zori_rent: {
    source: 'zillow',
    label: 'Zillow Research, ZORI (rent index)',
    url: 'https://www.zillow.com/research/data/',
  },
  median_sale_price: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
    methodologyUrl: 'https://www.redfin.com/news/data-center-metrics-definitions/',
  },
  median_list_price: {
    source: 'fred',
    label: 'Realtor.com · via FRED',
    url: 'https://fred.stlouisfed.org/categories/97',
  },
  median_price_per_sqft: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
  },
  active_listings: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
  },
  new_listings: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
  },
  homes_sold: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
  },
  months_supply: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
  },
  days_on_market: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
  },
  sale_to_list_ratio: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
  },
  pct_sold_above_list: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
  },
  pct_price_drops: {
    source: 'redfin',
    label: 'Redfin Data Center, monthly',
    url: 'https://www.redfin.com/news/data-center/',
  },
  mortgage_30y_rate: {
    source: 'fred',
    label: 'Freddie Mac PMMS · via FRED (MORTGAGE30US)',
    url: 'https://fred.stlouisfed.org/series/MORTGAGE30US',
    methodologyUrl: 'https://www.freddiemac.com/pmms',
  },
  mortgage_15y_rate: {
    source: 'fred',
    label: 'Freddie Mac PMMS · via FRED (MORTGAGE15US)',
    url: 'https://fred.stlouisfed.org/series/MORTGAGE15US',
  },
  median_household_income: {
    source: 'census',
    label: 'U.S. Census Bureau, ACS 5-year (B19013)',
    url: 'https://data.census.gov/table/ACSDT5Y2024.B19013',
  },
  median_home_value: {
    source: 'census',
    label: 'U.S. Census Bureau, ACS 5-year (B25077)',
    url: 'https://data.census.gov/table/ACSDT5Y2024.B25077',
  },
  median_gross_rent: {
    source: 'census',
    label: 'U.S. Census Bureau, ACS 5-year (B25064)',
    url: 'https://data.census.gov/table/ACSDT5Y2024.B25064',
  },
  unemployment_rate: {
    source: 'bls',
    label: 'U.S. Bureau of Labor Statistics, LAUS',
    url: 'https://www.bls.gov/lau/',
  },
  federal_employment: {
    source: 'qcew',
    label: 'U.S. Bureau of Labor Statistics, QCEW (federal government)',
    url: 'https://www.bls.gov/cew/',
  },
  building_permits: {
    source: 'census',
    label: 'U.S. Census Bureau, Building Permits Survey',
    url: 'https://www.census.gov/construction/bps/',
  },
  hotness_score: {
    source: 'fred',
    label: 'Realtor.com Hotness · via FRED',
    url: 'https://www.realtor.com/research/data/',
  },
  hotness_rank: {
    source: 'fred',
    label: 'Realtor.com Hotness Rank · via FRED',
    url: 'https://www.realtor.com/research/data/',
  },
  population: {
    source: 'census',
    label: 'U.S. Census Bureau, ACS 5-year',
    url: 'https://data.census.gov/',
  },
};

/** Format a one-line "Source: X, as of Y" string for a metric. */
export function citationLine(metric: MetricId, asOf?: string): string {
  const c = CITATIONS[metric];
  if (!c) return '';
  return asOf ? `Source: ${c.label} · as of ${asOf}` : `Source: ${c.label}`;
}
