import type { CountySummary } from '@dmv/shared';
import type { CompareMetric } from '../../lib/compare-metrics.js';

interface DifferenceCalloutProps {
  counties: CountySummary[];
  metric: CompareMetric;
}

const SPREAD_THRESHOLDS: Record<string, number> = {
  zhvi: 0.5,
  medianSalePrice: 0.5,
  daysOnMarket: 15,
  monthsSupply: 2,
  marketHealthScore: 30,
  affordabilityIndex: 0.2,
};

export function DifferenceCallout({ counties, metric }: DifferenceCalloutProps) {
  const values = counties
    .map((c) => ({ name: c.name, value: metric.get(c) }))
    .filter((r): r is { name: string; value: number } => r.value !== undefined);

  if (values.length < 2) return null;

  const sorted = [...values].sort((a, b) => a.value - b.value);
  const low = sorted[0]!;
  const high = sorted[sorted.length - 1]!;
  const spread = metric.id === 'zhvi' || metric.id === 'medianSalePrice' || metric.id === 'affordabilityIndex'
    ? (high.value - low.value) / low.value
    : high.value - low.value;

  const threshold = SPREAD_THRESHOLDS[metric.id] ?? Infinity;
  if (spread < threshold) return null;

  return (
    <div className="mt-4 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
      <p className="text-sm font-medium text-gold-700">
        Notable spread: {high.name} is {metric.format(high.value)} vs {low.name} at {metric.format(low.value)}.
      </p>
    </div>
  );
}
