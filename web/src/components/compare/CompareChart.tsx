import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { CountySummary } from '@dmv/shared';
import type { CompareMetric } from '../../lib/compare-metrics.js';
import { JurisdictionBadge } from '../JurisdictionBadge.js';
import { shortName } from '../../lib/county-names.js';

const COLORS = ['#2B201A', '#A4243B', '#1d4ed8', '#059669', '#d97706'];

interface CompareChartProps {
  counties: CountySummary[];
  metric: CompareMetric;
}

interface ChartPoint { date: string; [fips: string]: number | string | undefined }

export function CompareChart({ counties, metric }: CompareChartProps) {
  if (!metric.seriesKey) {
    return (
      <div className="rounded-2xl border border-border-soft bg-surface-1 p-6 text-sm text-fg-3">
        No time-series data is available for {metric.label.toLowerCase()}. See the ranked comparison below.
      </div>
    );
  }

  const seriesKey = metric.seriesKey;
  const dateSet = new Set<string>();
  for (const c of counties) {
    for (const p of c.series[seriesKey] ?? []) dateSet.add(p.date);
  }
  const dates = [...dateSet].sort().slice(-60);

  const data: ChartPoint[] = dates.map((date) => {
    const row: ChartPoint = { date };
    for (const c of counties) {
      const pt = (c.series[seriesKey] ?? []).find((p) => p.date === date);
      if (pt) row[c.fips] = pt.value;
    }
    return row;
  });

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border-soft bg-surface-1 p-6 text-sm text-fg-3">
        No {metric.label.toLowerCase()} time-series data for the selected counties.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-soft bg-surface-1 p-6">
      <div className="eyebrow mb-1.5 text-fg-3">Trend · last 5 years</div>
      <h3 className="font-display text-[20px] font-semibold tracking-tight text-fg-1 mb-4">
        {metric.chartTitle ?? metric.label}
      </h3>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 items-center">
        {counties.map((c, i) => (
          <span key={c.fips} className="flex items-center gap-2 text-sm text-fg-2">
            <span
              className="inline-block w-5 h-[2px] rounded"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <JurisdictionBadge jurisdiction={c.jurisdiction} />
            {shortName(c)}
          </span>
        ))}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-fg-3)' }}
              tickFormatter={(d: string) => `'${d.slice(2, 4)}`}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-fg-3)' }}
              tickFormatter={(v: number) => metric.format(v)}
              width={80}
            />
            <Tooltip
              formatter={(v) => typeof v === 'number' ? metric.format(v) : ''}
              labelFormatter={(d) => String(d ?? '')}
            />
            {counties.map((c, i) => (
              <Line
                key={c.fips}
                type="monotone"
                dataKey={c.fips}
                name={c.name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {metric.chartSource && (
        <div className="mt-4 text-[11px] text-fg-3 font-mono">{metric.chartSource}</div>
      )}
    </div>
  );
}
