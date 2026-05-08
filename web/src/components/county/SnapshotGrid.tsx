import type { CountySummary } from '@dmv/shared';
import { MetricCard } from '../MetricCard.js';
import { formatCurrency } from '../../lib/format.js';

interface SnapshotGridProps {
  county: CountySummary;
}

export function SnapshotGrid({ county }: SnapshotGridProps) {
  const { current } = county;

  const healthScore = current.marketHealthScore;
  const healthDisplay = healthScore !== undefined ? `${Math.round(healthScore)} / 100` : '—';
  const healthHue: 'good' | 'caution' | 'poor' | undefined =
    healthScore === undefined
      ? undefined
      : healthScore >= 56
        ? 'good'
        : healthScore >= 36
          ? 'caution'
          : 'poor';

  const affordability = current.affordabilityIndex;
  const affordDisplay = affordability !== undefined
    ? `${(affordability * 100).toFixed(0)}%`
    : '—';
  const affordSub = affordability !== undefined
    ? `of income (30% rule: affordable)`
    : undefined;

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
      <MetricCard
        label="Typical home value"
        value={current.zhvi !== undefined ? formatCurrency(current.zhvi) : '—'}
        change={current.zhviYoY}
        source="Zillow ZHVI"
      />
      <MetricCard
        label="Median sale price"
        value={current.medianSalePrice !== undefined ? formatCurrency(current.medianSalePrice) : '—'}
        change={current.medianSalePriceYoY}
        source="Redfin"
      />
      <MetricCard
        label="Days on market"
        value={current.daysOnMarket !== undefined ? `${current.daysOnMarket} days` : '—'}
        source="Redfin"
      />
      <MetricCard
        label="Months of supply"
        value={current.monthsSupply !== undefined ? `${current.monthsSupply.toFixed(1)} mo` : '—'}
        source="Bright MLS"
      />
      <MetricCard
        label="Market health"
        value={healthDisplay}
        health={healthHue}
        source="Composite"
      />
      <MetricCard
        label="Affordability"
        value={affordDisplay}
        sub={affordSub}
        source="vs. 30% rule"
      />
    </div>
  );
}
