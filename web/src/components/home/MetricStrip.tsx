import { MetricCard } from '../MetricCard.js';
import { HealthCard } from './HealthCard.js';
import type { MetroSnapshot } from '../../lib/metro.js';

interface MetricStripProps {
  metro: MetroSnapshot;
}

function fmt(n: number | undefined, formatter: (v: number) => string, fallback = '—'): string {
  return n !== undefined ? formatter(n) : fallback;
}

export function MetricStrip({ metro }: MetricStripProps) {
  const mortgageDisplay = metro.mortgageRate !== undefined
    ? `${(metro.mortgageRate * 100).toFixed(2)}%`
    : '—';

  const listingsDisplay = metro.activeListings !== undefined
    ? `~${(metro.activeListings / 1000).toFixed(1)}K`
    : '—';

  const domDisplay = metro.daysOnMarket !== undefined
    ? `${Math.round(metro.daysOnMarket)} days`
    : '—';

  const salePriceDisplay = fmt(
    metro.medianSalePrice,
    (v) => `$${(v / 1000).toFixed(0)}K`,
  );

  return (
    <div className="max-w-container mx-auto px-8 mt-8">
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <MetricCard
          label="Metro median sale price"
          value={salePriceDisplay}
          change={metro.medianSalePriceYoY}
          source="Redfin · latest"
        />
        <MetricCard
          label="30-yr fixed mortgage"
          value={mortgageDisplay}
          change={metro.mortgageRateYoY}
          changeLabel="vs. 1 yr ago"
          source="Freddie Mac PMMS"
        />
        <MetricCard
          label="Active listings"
          value={listingsDisplay}
          change={metro.activeListingsYoY}
          source="Redfin · latest"
        />
        <MetricCard
          label="Median days on market"
          value={domDisplay}
          sub="Metro median, all home types"
          source="Redfin · latest"
        />
        {metro.marketHealth !== undefined ? (
          <HealthCard score={Math.round(metro.marketHealth)} />
        ) : (
          <MetricCard label="Metro market health" value="—" sub="Insufficient data" />
        )}
      </div>
    </div>
  );
}
