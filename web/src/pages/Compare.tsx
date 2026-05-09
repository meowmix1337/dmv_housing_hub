import { useQueries } from '@tanstack/react-query';
import { getCountySummary } from '../api.js';
import { DMV_FIPS } from '../lib/fips.js';
import { COMPARE_METRICS } from '../lib/compare-metrics.js';
import { useCompareState } from '../hooks/useCompareState.js';
import { CountyPicker } from '../components/compare/CountyPicker.js';
import { MetricPicker } from '../components/compare/MetricPicker.js';
import { CompareChart } from '../components/compare/CompareChart.js';
import { RankedTable } from '../components/compare/RankedTable.js';
import { DifferenceCallout } from '../components/compare/DifferenceCallout.js';
import { EmptyState } from '../components/compare/EmptyState.js';
import { Container } from '../components/Container.js';

export function Compare() {
  const { selected, metric: metricId, toggle, setMetric } = useCompareState();

  const allResults = useQueries({
    queries: DMV_FIPS.map((fips) => ({
      queryKey: ['county', fips] as const,
      queryFn: () => getCountySummary(fips),
    })),
  });

  const allCounties = allResults.map((r) => r.data).filter((d) => d !== undefined);
  const selectedCounties = allCounties.filter((c) => selected.includes(c.fips));
  const metric = COMPARE_METRICS.find((m) => m.id === metricId) ?? COMPARE_METRICS[0]!;

  return (
    <div className="bg-bg-paper min-h-screen">
      <div className="border-b border-border-soft">
        <Container className="pt-12 pb-8">
          <div className="eyebrow text-fg-3">Compare counties</div>
          <h1 className="mt-2.5 font-display text-[44px] font-semibold leading-[1.05] tracking-tight text-fg-1">
            How does your county stack up against its neighbors?
          </h1>
          <p className="mt-3.5 text-base text-fg-2 leading-relaxed max-w-[640px]">
            Pick 2 to 5 jurisdictions and a metric. The DMV&rsquo;s internal divergence is the story national averages can&rsquo;t tell.
          </p>
        </Container>
      </div>

      <Container className="mt-8 pb-16">
        <div className="grid grid-cols-[320px_1fr] gap-6 items-start">
          <CountyPicker
            allCounties={allCounties}
            selected={selected}
            onToggle={toggle}
          />

          <div className="flex flex-col gap-6 min-w-0">
            <MetricPicker metric={metricId} onSelect={setMetric} />

            {selectedCounties.length < 2 ? (
              <EmptyState />
            ) : (
              <>
                <CompareChart counties={selectedCounties} metric={metric} />
                <DifferenceCallout counties={selectedCounties} metric={metric} />
                <RankedTable counties={selectedCounties} metric={metric} />
              </>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}
