import type { CountySeries, CountySummary, MetricPoint } from '@dmv/shared';
import { formatCurrency } from './format.js';

export type CompareMetricId = 'zhvi' | 'medianSalePrice' | 'daysOnMarket' | 'monthsSupply' | 'marketHealthScore' | 'affordabilityIndex';

/**
 * Compare-page series keys are restricted to flat `MetricPoint[]` fields on
 * `CountySeries` — the structured `activeListings` breakdown is rendered on
 * the Home and County pages instead, not as a multi-county overlay.
 */
export type FlatSeriesKey = {
  [K in keyof CountySeries]: NonNullable<CountySeries[K]> extends MetricPoint[] ? K : never
}[keyof CountySeries];

export interface CompareMetric {
  id: CompareMetricId;
  label: string;
  format: (v: number) => string;
  get: (c: CountySummary) => number | undefined;
  higherIsBetter: boolean;
  seriesKey?: FlatSeriesKey;
  chartTitle?: string;
  chartSource?: string;
}

export const COMPARE_METRICS: CompareMetric[] = [
  {
    id: 'zhvi',
    label: 'Typical home value',
    format: formatCurrency,
    get: (c) => c.current.zhvi,
    higherIsBetter: false,
    seriesKey: 'zhvi',
    chartTitle: 'Typical home value, monthly',
    chartSource: 'Source: Zillow Research, ZHVI All Homes (Smoothed) · monthly',
  },
  {
    id: 'medianSalePrice',
    label: 'Median sale price',
    format: formatCurrency,
    get: (c) => c.current.medianSalePrice,
    higherIsBetter: false,
    seriesKey: 'medianSalePrice',
    chartTitle: 'Median sale price, monthly',
    chartSource: 'Source: Redfin Data Center · monthly',
  },
  {
    id: 'daysOnMarket',
    label: 'Days on market',
    format: (v) => `${Math.round(v)} days`,
    get: (c) => c.current.daysOnMarket,
    higherIsBetter: false,
    seriesKey: 'daysOnMarket',
    chartTitle: 'Days on market, monthly',
    chartSource: 'Source: Redfin Data Center · monthly',
  },
  {
    id: 'monthsSupply',
    label: 'Months of supply',
    format: (v) => `${v.toFixed(1)} mo`,
    get: (c) => c.current.monthsSupply,
    higherIsBetter: false,
  },
  {
    id: 'marketHealthScore',
    label: 'Market health (0–100)',
    format: (v) => `${Math.round(v)} / 100`,
    get: (c) => c.current.marketHealthScore,
    higherIsBetter: true,
  },
  {
    id: 'affordabilityIndex',
    label: 'Affordability (NAR HAI)',
    format: (v) => `${Math.round(v)}`,
    get: (c) => c.current.affordabilityIndex,
    higherIsBetter: true,
  },
];
