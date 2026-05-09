import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Cadence, MetricPoint } from '@dmv/shared';
import { formatCurrency, formatNumber } from '../lib/format.js';

export interface PriceChartProps {
  data: MetricPoint[];
  unit: 'USD' | 'index' | 'percent';
  cadence?: Cadence;
  height?: number;
}

function formatXTick(iso: string, cadence: Cadence): string {
  if (cadence === 'annual') return iso.slice(0, 4);
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function PriceChart({ data, unit, cadence = 'monthly', height = 320 }: PriceChartProps) {
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        date: p.date,
        value: p.value,
      })),
    [data],
  );

  const formatter = (v: number): string => {
    if (unit === 'USD') return formatCurrency(v);
    if (unit === 'percent') return `${(v * 100).toFixed(2)}%`;
    return formatNumber(v);
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickFormatter={(d: string) => formatXTick(d, cadence)}
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickFormatter={(v: number) => {
            if (unit === 'USD' && v >= 1_000) return `$${Math.round(v / 1_000)}k`;
            if (unit === 'percent') return `${(v * 100).toFixed(0)}%`;
            return Math.round(v).toString();
          }}
          width={64}
        />
        <Tooltip
          contentStyle={{ fontSize: 12 }}
          labelFormatter={(d) => String(d ?? '')}
          formatter={(v) => formatter(Number(v ?? 0))}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#1d4ed8"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
