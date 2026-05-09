import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { CountySummary } from '@dmv/shared';
import { Source } from '../Source.js';
import { InsufficientData } from '../InsufficientData.js';
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

interface CountyInventoryProps {
  county: CountySummary;
}

function isoYearAgo(date: string): string {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export function CountyInventory({ county }: CountyInventoryProps) {
  const breakdown = county.series.activeListings;
  if (!breakdown || breakdown.total.length === 0) {
    return (
      <InsufficientData
        eyebrow="Active inventory"
        caption="Inventory data not yet available for this county."
      />
    );
  }

  const data = breakdown.total.map((p, i) => ({
    date: p.date,
    single_family: breakdown.byType.single_family[i]?.value ?? 0,
    townhouse: breakdown.byType.townhouse[i]?.value ?? 0,
    condo: breakdown.byType.condo[i]?.value ?? 0,
    multi_family: breakdown.byType.multi_family[i]?.value ?? 0,
  }));

  const latest = breakdown.total.at(-1);
  const cutoff = latest ? isoYearAgo(latest.date) : '';
  let yearAgo: { date: string; value: number } | undefined;
  for (let i = breakdown.total.length - 1; i >= 0; i--) {
    const p = breakdown.total[i];
    if (p && p.date <= cutoff) { yearAgo = p; break; }
  }
  const yoy =
    latest && yearAgo && yearAgo.value > 0
      ? (latest.value - yearAgo.value) / yearAgo.value
      : undefined;
  const yoyText =
    yoy === undefined
      ? 'YoY n/a'
      : Math.abs(yoy) < 0.02
        ? 'roughly flat YoY'
        : `${yoy > 0 ? 'up' : 'down'} ${formatPercent(Math.abs(yoy))} YoY`;

  const yearTicks = data
    .filter((d) => d.date.endsWith('-12-31') && parseInt(d.date.slice(0, 4)) % 2 === 0)
    .map((d) => d.date);

  return (
    <div className="bg-surface-1 rounded-lg border border-border-soft overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border-soft">
        <div className="eyebrow mb-1.5">Active inventory</div>
        <h2 className="font-display text-h2 font-semibold tracking-tight">
          Listings by property type
        </h2>
        <p className="text-sm text-fg-2 mt-1">
          {latest
            ? `${formatNumber(latest.value)} active listings, ${yoyText}, as of ${latest.date}.`
            : 'Monthly active listings, by property type.'}
        </p>
      </div>
      <div style={{ height: 280 }} className="px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
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
      </div>
      <div className="px-6 pb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-fg-3">
          {TYPE_ORDER.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: TYPE_COLOR[t], opacity: 0.65 }}
              />
              {TYPE_LABEL[t]}
            </span>
          ))}
        </div>
        <Source>Source: Redfin Data Center · monthly</Source>
      </div>
    </div>
  );
}
