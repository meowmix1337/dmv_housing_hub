import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { CountySummary } from '@dmv/shared';
import type { CompareMetric } from '../../lib/compare-metrics.js';

const COLORS = ['#dc2626', '#1d4ed8', '#059669', '#d97706', '#7c3aed'];

interface CompareChartProps {
  counties: CountySummary[];
  metric: CompareMetric;
}

interface ChartPoint { date: string; [fips: string]: number | string | undefined }

export function CompareChart({ counties, metric }: CompareChartProps) {
  const dateSet = new Set<string>();
  for (const c of counties) {
    for (const p of c.series.fhfaHpi ?? []) dateSet.add(p.date);
  }
  const dates = [...dateSet].sort().slice(-60);

  const data: ChartPoint[] = dates.map((date) => {
    const row: ChartPoint = { date };
    for (const c of counties) {
      const pt = (c.series.fhfaHpi ?? []).find((p) => p.date === date);
      if (pt) row[c.fips] = pt.value;
    }
    return row;
  });

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-fg-3">
        No time-series data available for this metric.
      </div>
    );
  }

  return (
    <div className="h-72">
      <div className="mb-3 flex flex-wrap gap-3">
        {counties.map((c, i) => (
          <span key={c.fips} className="flex items-center gap-1.5 text-sm text-fg-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {c.name}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--color-fg-3)' }}
            tickFormatter={(d: string) => d.slice(0, 4)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-fg-3)' }}
            tickFormatter={(v: number) => metric.format(v)}
            width={80}
          />
          <Tooltip
            formatter={(v: number) => metric.format(v)}
            labelFormatter={(d: string) => d}
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
  );
}
