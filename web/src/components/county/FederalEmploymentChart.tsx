import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CountySummary } from '@dmv/shared';
import { Source } from '../Source.js';
import { formatNumber } from '../../lib/format.js';

interface FederalEmploymentChartProps {
  county: CountySummary;
}

export function FederalEmploymentChart({ county }: FederalEmploymentChartProps) {
  const points = county.series.federalEmployment;
  if (!points || points.length === 0) return null;

  const data = points.map((p) => ({
    date: p.date,
    year: parseInt(p.date.slice(0, 4)),
    value: p.value,
  }));

  const yearTicks = data.filter((d) => d.date.endsWith('-03-01')).map((d) => d.date);

  return (
    <div className="bg-surface-1 rounded-lg border border-border-soft overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border-soft">
        <div className="eyebrow mb-1.5">Federal workforce</div>
        <h2 className="font-display text-h2 font-semibold tracking-tight">Federal employment</h2>
        <p className="text-sm text-fg-2 mt-1">
          Civilian federal jobs located in {county.name}, by quarter.
        </p>
      </div>
      <div style={{ height: 260 }} className="px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="#F4EFE5" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: '#E7E2D8' }}
              tickLine={false}
              tickFormatter={(d: string) => d.slice(0, 4)}
              ticks={yearTicks}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                borderRadius: 8,
                border: '1px solid #E7E2D8',
              }}
              formatter={(v) => [formatNumber(Number(v)), 'Federal jobs']}
            />
            <Line
              dataKey="value"
              stroke="#1d4ed8"
              strokeWidth={2}
              dot={false}
              name="Federal jobs"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="px-6 pb-4">
        <Source>
          Source: U.S. Bureau of Labor Statistics, Quarterly Census of Employment and Wages.
        </Source>
      </div>
    </div>
  );
}
