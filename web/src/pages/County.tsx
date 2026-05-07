import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCountySummary } from '../api.js';
import { PriceChart } from '../components/PriceChart.js';
import { MetricCard } from '../components/MetricCard.js';
import { formatCurrency, formatDate, formatPercent } from '../lib/format.js';

export function County() {
  const { fips } = useParams<{ fips: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['county', fips],
    queryFn: () => {
      if (!fips) throw new Error('fips param missing');
      return getCountySummary(fips);
    },
    enabled: Boolean(fips),
  });

  if (!fips) return <div className="text-neutral-500">Missing FIPS</div>;
  if (isLoading) return <div className="text-neutral-500">Loading…</div>;
  if (error)
    return (
      <div className="text-red-600">
        Failed to load: {error instanceof Error ? error.message : 'unknown'}
      </div>
    );
  if (!data) return <div className="text-neutral-500">No data</div>;

  const { current, series } = data;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Last updated {formatDate(data.lastUpdated)}
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Typical home value (ZHVI)"
          value={current.zhvi !== undefined ? formatCurrency(current.zhvi) : '—'}
          delta={current.zhviYoY !== undefined ? formatPercent(current.zhviYoY) : undefined}
          deltaLabel="YoY"
        />
        <MetricCard
          label="Median sale price"
          value={
            current.medianSalePrice !== undefined ? formatCurrency(current.medianSalePrice) : '—'
          }
          delta={
            current.medianSalePriceYoY !== undefined
              ? formatPercent(current.medianSalePriceYoY)
              : undefined
          }
          deltaLabel="YoY"
        />
        <MetricCard
          label="Days on market"
          value={current.daysOnMarket !== undefined ? `${current.daysOnMarket}` : '—'}
        />
        <MetricCard
          label="Months of supply"
          value={current.monthsSupply !== undefined ? current.monthsSupply.toFixed(1) : '—'}
        />
      </section>

      {series.fhfaHpi && series.fhfaHpi.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="font-medium">FHFA House Price Index — historical</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Source: U.S. Federal Housing Finance Agency, via FRED
          </p>
          <div className="mt-4">
            <PriceChart data={series.fhfaHpi} unit="index" cadence="annual" />
          </div>
        </section>
      )}

      {series.zhvi && series.zhvi.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="font-medium">Zillow Home Value Index — typical home value</h2>
          <p className="text-xs text-neutral-500 mt-1">Source: Zillow Research</p>
          <div className="mt-4">
            <PriceChart data={series.zhvi} unit="USD" />
          </div>
        </section>
      )}
    </div>
  );
}
