/**
 * Canonical types for the DMV housing app. These are imported by both
 * the ingest scripts and the React frontend; do not break compatibility
 * between the two without updating both.
 */

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

export type Jurisdiction = 'DC' | 'MD' | 'VA';

/**
 * Canonical metric IDs. Add new ones here and update the union before
 * adding ingest support; the type is the source of truth.
 */
export type MetricId =
  | 'fhfa_hpi'
  | 'median_sale_price'
  | 'median_list_price'
  | 'median_price_per_sqft'
  | 'zhvi_all_homes'
  | 'zhvi_sfh'
  | 'zhvi_condo'
  | 'zori_rent'
  | 'active_listings'
  | 'new_listings'
  | 'homes_sold'
  | 'months_supply'
  | 'days_on_market'
  | 'sale_to_list_ratio'
  | 'pct_sold_above_list'
  | 'pct_price_drops'
  | 'mortgage_30y_rate'
  | 'mortgage_15y_rate'
  | 'median_household_income'
  | 'median_home_value'
  | 'median_gross_rent'
  | 'unemployment_rate'
  | 'federal_employment'
  | 'building_permits'
  | 'hotness_score'
  | 'hotness_rank'
  | 'population';

export type Unit =
  | 'USD'
  | 'USD_per_sqft'
  | 'percent'
  | 'ratio'
  | 'days'
  | 'months'
  | 'count'
  | 'index_2000=100'
  | 'index_other';

/**
 * One observation from one source for one metric at one point in time.
 * The atomic unit produced by every ingester.
 */
export interface Observation {
  source: string;
  series: string;
  fips: string;
  metric: MetricId;
  observedAt: string;
  value: number;
  unit: Unit;
  /** Margin of error at 90% CI (ACS-style); absent for sources that don't publish one. */
  moe?: number;
}

export interface MetricPoint {
  date: string;
  value: number;
}

export interface MetricSeries {
  metric: MetricId;
  fips: string;
  unit: Unit;
  cadence: Cadence;
  source: string;
  lastUpdated: string;
  points: MetricPoint[];
}

export interface CountyForecast {
  source: string;
  metric: MetricId;
  horizonMonths: number;
  forecastValue: number;
  forecastChangePct: number;
  publishedAt: string;
}

export interface CountyCurrentSnapshot {
  medianSalePrice?: number;
  medianSalePriceYoY?: number;
  zhvi?: number;
  zhviYoY?: number;
  daysOnMarket?: number;
  monthsSupply?: number;
  saleToListRatio?: number;
  pctSoldAboveList?: number;
  unemploymentRate?: number;
  federalEmployment?: number;
  federalEmploymentYoY?: number;
  federalEmploymentAsOf?: string;
  activeListings?: number;
  activeListingsYoY?: number;
  marketHealthScore?: number;
  affordabilityIndex?: number;
}

export interface ActiveListingsByType {
  single_family: MetricPoint[];
  condo: MetricPoint[];
  townhouse: MetricPoint[];
  multi_family: MetricPoint[];
}

export interface ActiveListingsBreakdown {
  total: MetricPoint[];
  byType: ActiveListingsByType;
}

export interface CountySeries {
  fhfaHpi?: MetricPoint[];
  zhvi?: MetricPoint[];
  medianSalePrice?: MetricPoint[];
  daysOnMarket?: MetricPoint[];
  activeListings?: ActiveListingsBreakdown;
  federalEmployment?: MetricPoint[];
}

/**
 * The shape rendered by the County page. One JSON file per county under
 * `web/public/data/counties/{fips}.json`.
 */
export interface CountySummary {
  fips: string;
  name: string;
  jurisdiction: Jurisdiction;
  population?: number;
  medianHouseholdIncome?: number;
  propertyTaxRate?: number;
  lastUpdated: string;
  current: CountyCurrentSnapshot;
  series: CountySeries;
  forecasts?: CountyForecast[];
}

export interface ManifestSourceEntry {
  name: string;
  lastUpdated: string;
  cadence: Cadence;
  status: 'ok' | 'stale' | 'error';
  /** ISO date of the last manual spot-check; populated from DATA_SOURCES.md's Verification section. */
  lastVerified?: string;
}

export interface Manifest {
  generatedAt: string;
  sources: ManifestSourceEntry[];
}

export interface ActiveListingsDmv {
  metric: 'active_listings';
  fips: 'DMV';
  unit: 'count';
  cadence: 'monthly';
  source: 'redfin';
  lastUpdated: string;
  asOf: string;
  latest: {
    total: number;
    byType: { single_family: number; condo: number; townhouse: number; multi_family: number };
  };
  latestYoY: number | undefined;
  series: ActiveListingsBreakdown;
  coverage: { fips: string[]; missing: string[] };
}
