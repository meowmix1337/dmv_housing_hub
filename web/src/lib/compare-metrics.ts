import type { CountySummary } from '@dmv/shared';
import { formatCurrency } from './format.js';

export type CompareMetricId = 'zhvi' | 'medianSalePrice' | 'daysOnMarket' | 'monthsSupply' | 'marketHealthScore' | 'affordabilityIndex';

export interface CompareMetric {
  id: CompareMetricId;
  label: string;
  format: (v: number) => string;
  get: (c: CountySummary) => number | undefined;
  higherIsBetter: boolean;
}

export const COMPARE_METRICS: CompareMetric[] = [
  {
    id: 'zhvi',
    label: 'Home value',
    format: formatCurrency,
    get: (c) => c.current.zhvi,
    higherIsBetter: false,
  },
  {
    id: 'medianSalePrice',
    label: 'Sale price',
    format: formatCurrency,
    get: (c) => c.current.medianSalePrice,
    higherIsBetter: false,
  },
  {
    id: 'daysOnMarket',
    label: 'Days on market',
    format: (v) => `${Math.round(v)} days`,
    get: (c) => c.current.daysOnMarket,
    higherIsBetter: false,
  },
  {
    id: 'monthsSupply',
    label: 'Months supply',
    format: (v) => `${v.toFixed(1)} mo`,
    get: (c) => c.current.monthsSupply,
    higherIsBetter: false,
  },
  {
    id: 'marketHealthScore',
    label: 'Market health',
    format: (v) => `${Math.round(v)} / 100`,
    get: (c) => c.current.marketHealthScore,
    higherIsBetter: true,
  },
  {
    id: 'affordabilityIndex',
    label: 'Affordability',
    format: (v) => `${(v * 100).toFixed(0)}%`,
    get: (c) => c.current.affordabilityIndex,
    higherIsBetter: false,
  },
];
