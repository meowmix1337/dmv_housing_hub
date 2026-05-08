import type { CountySummary } from '@dmv/shared';
import type { CompareMetric } from '../../lib/compare-metrics.js';

interface RankedTableProps {
  counties: CountySummary[];
  metric: CompareMetric;
}

export function RankedTable({ counties, metric }: RankedTableProps) {
  const withValues = counties
    .map((c) => ({ county: c, value: metric.get(c) }))
    .filter((row): row is { county: CountySummary; value: number } => row.value !== undefined);

  const sorted = [...withValues].sort((a, b) =>
    metric.higherIsBetter ? b.value - a.value : a.value - b.value,
  );

  const max = sorted[0]?.value ?? 1;

  return (
    <div className="mt-6 rounded-lg border border-border-soft overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-soft bg-bg-subtle">
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-fg-3">
              County
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-fg-3">
              {metric.label}
            </th>
            <th className="w-32 px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ county, value }, i) => (
            <tr key={county.fips} className={i % 2 === 0 ? 'bg-bg-paper' : 'bg-bg-subtle'}>
              <td className="px-4 py-2 text-fg-1">{county.name}</td>
              <td className="px-4 py-2 text-right font-mono text-fg-1">
                {metric.format(value)}
              </td>
              <td className="px-4 py-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-border-soft">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(value / max) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
