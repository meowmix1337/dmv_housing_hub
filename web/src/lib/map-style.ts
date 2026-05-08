import type { CountySummary } from '@dmv/shared';
import type { ChoroplethMetric } from './color-scales.js';
import { colorForMetric } from './color-scales.js';

export function getMetricValue(county: CountySummary, metric: ChoroplethMetric): number | undefined {
  switch (metric) {
    case 'zhviYoY':
      return county.current.zhviYoY;
    case 'zhvi':
      return county.current.zhvi;
    case 'daysOnMarket':
      return county.current.daysOnMarket;
    case 'monthsSupply':
      return county.current.monthsSupply;
    case 'marketHealthScore':
      return county.current.marketHealthScore;
  }
}

export function buildFillColors(
  metric: ChoroplethMetric,
  counties: CountySummary[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const county of counties) {
    const value = getMetricValue(county, metric);
    result[county.fips] = value !== undefined
      ? colorForMetric(metric, value)
      : '#E7E2D8';
  }
  return result;
}
