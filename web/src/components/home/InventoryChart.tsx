import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { ActiveListingsDmv } from '@dmv/shared';
import { DriverCard } from './DriverCard.js';
import { formatNumber, formatPercent } from '../../lib/format.js';

const TYPE_ORDER = ['single_family', 'townhouse', 'condo', 'multi_family'] as const;

const TYPE_COLOR: Record<typeof TYPE_ORDER[number], string> = {
  single_family: '#A4243B',
  townhouse:     '#C66B4F',
  condo:         '#D9A05B',
  multi_family:  '#7B3E2A',
};

const TYPE_LABEL: Record<typeof TYPE_ORDER[number], string> = {
  single_family: 'Single-family',
  townhouse:     'Townhouse',
  condo:         'Condo',
  multi_family:  'Multi-family',
};

interface InventoryChartProps {
  data: ActiveListingsDmv;
}

export function InventoryChart({ data }: InventoryChartProps) {
  const points = data.series.total.map((p, i) => ({
    date: p.date,
    single_family: data.series.byType.single_family[i]?.value ?? 0,
    townhouse: data.series.byType.townhouse[i]?.value ?? 0,
    condo: data.series.byType.condo[i]?.value ?? 0,
    multi_family: data.series.byType.multi_family[i]?.value ?? 0,
  }));

  const callout = `~${(data.latest.total / 1000).toFixed(1)}K`;
  const calloutColor =
    data.latestYoY === undefined
      ? 'var(--fg-1)'
      : data.latestYoY < 0
        ? '#059669'
        : '#dc2626';
  const yoyText =
    data.latestYoY === undefined
      ? 'YoY n/a'
      : Math.abs(data.latestYoY) < 0.02
        ? 'roughly flat YoY'
        : `${data.latestYoY > 0 ? 'up' : 'down'} ${formatPercent(Math.abs(data.latestYoY))} YoY`;
  const title = `DMV listings ${yoyText}`;

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#F4EFE5" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
          interval={23}
          axisLine={{ stroke: '#E7E2D8' }}
          tickLine={false}
          tickFormatter={(d: string) => `'${d.slice(2, 4)}`}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            borderRadius: 8,
            border: '1px solid #E7E2D8',
          }}
          formatter={(v, name) => [
            formatNumber(Number(v)),
            TYPE_LABEL[name as keyof typeof TYPE_LABEL] ?? String(name),
          ]}
          labelFormatter={(d) =>
            new Date(String(d)).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          }
        />
        {TYPE_ORDER.map((t) => (
          <Area
            key={t}
            type="monotone"
            dataKey={t}
            stackId="a"
            stroke={TYPE_COLOR[t]}
            strokeWidth={1}
            fill={TYPE_COLOR[t]}
            fillOpacity={0.65}
            name={t}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );

  return (
    <DriverCard
      kicker="Active inventory"
      title={title}
      callout={callout}
      calloutColor={calloutColor}
      chart={chart}
      source={`Redfin · DMV total · ${data.coverage.fips.length} counties · as of ${data.asOf}`}
    />
  );
}
