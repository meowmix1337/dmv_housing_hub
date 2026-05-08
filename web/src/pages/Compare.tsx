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
    <div className="bg-bg-paper min-h-screen py-8">
      <Container>
        <h1 className="mb-1 font-display text-3xl font-semibold text-fg-1">Compare counties</h1>
        <p className="mb-8 text-sm text-fg-3">Select up to 5 counties to compare side-by-side.</p>

        <div className="flex gap-8 items-start">
          <CountyPicker
            allCounties={allCounties}
            selected={selected}
            onToggle={toggle}
          />

          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <MetricPicker metric={metricId} onSelect={setMetric} />
            </div>

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
