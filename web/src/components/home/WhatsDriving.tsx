import {
  AreaChart, Area, BarChart, Bar, Cell, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { ActiveListingsDmv, CountySummary, MetricSeries } from '@dmv/shared';
import type { FederalEmploymentDmv } from '../../api.js';
import { SectionHeader } from '../SectionHeader.js';
import { Card } from '../Card.js';
import { DriverCard } from './DriverCard.js';
import { InventoryChart } from './InventoryChart.js';
import { formatNumber, formatPercent } from '../../lib/format.js';

interface WhatsDrivingProps {
  mortgageRates: MetricSeries;
  fedEmployment?: FederalEmploymentDmv | undefined;
  inventory?: ActiveListingsDmv | undefined;
  counties?: CountySummary[];
}

function AffordabilitySplitChart({ counties }: { counties: CountySummary[] }) {
  const rows = counties
    .map((c) => ({
      name: c.name.replace(/ County$/, '').replace(/ city$/, ''),
      hai: c.current.affordabilityIndex,
    }))
    .filter((r): r is { name: string; hai: number } => r.hai !== undefined)
    .map((r) => ({ name: r.name, hai: Math.round(r.hai) }))
    .sort((a, b) => a.hai - b.hai);

  if (rows.length < 2) {
    return (
      <Card padding="none" className="p-6 flex flex-col gap-3.5">
        <div className="eyebrow text-fg-3">County affordability split</div>
        <h3 className="font-display text-[22px] font-semibold tracking-tight leading-snug">
          Affordability breakdown by county
        </h3>
        <p className="text-sm text-fg-2 leading-snug">
          Need affordability data for at least two counties.
        </p>
      </Card>
    );
  }

  const least = rows[0]!;
  const most = rows.at(-1)!;
  const calloutColor = most.hai >= 100 ? '#059669' : '#dc2626';
  const callout = `${least.hai} – ${most.hai}`;
  const title =
    most.hai >= 100 && least.hai < 100
      ? `${most.name} is affordable, ${least.name} is not`
      : most.hai >= 100
        ? `Range of ${most.hai - least.hai} HAI points across ${rows.length} counties`
        : `Every county below NAR HAI = 100 (less affordable than benchmark)`;

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#F4EFE5" horizontal={false} />
        <XAxis type="number" domain={[0, 'dataMax + 10']}
          tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
          axisLine={{ stroke: '#E7E2D8' }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={92}
          tick={{ fontSize: 10, fill: '#5C5447', fontFamily: 'var(--font-mono)' }}
          axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)', borderRadius: 8, border: '1px solid #E7E2D8' }}
          formatter={(v) => [Number(v), 'NAR HAI']} />
        <ReferenceLine x={100} stroke="#9A9384" strokeDasharray="3 3"
          label={{ value: '100 = qualifies', position: 'top', fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }} />
        <Bar dataKey="hai" radius={[0, 3, 3, 0]}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.hai >= 100 ? '#059669' : '#dc2626'} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <DriverCard
      kicker="County affordability split"
      title={title}
      callout={callout}
      calloutColor={calloutColor}
      chart={chart}
      source={`NAR HAI · higher = more affordable · ${rows.length} counties`}
    />
  );
}

function FedEmploymentChart({ data }: { data: FederalEmploymentDmv }) {
  const points = data.points.map((p) => ({ date: p.date, value: p.value }));
  const callout = formatNumber(data.total);
  const calloutColor =
    data.totalYoY === undefined
      ? 'var(--fg-1)'
      : data.totalYoY < 0
        ? '#dc2626'
        : '#059669';
  const yoyLabel =
    data.totalYoY !== undefined ? `${formatPercent(data.totalYoY)} YoY` : 'YoY n/a';
  const title =
    data.totalYoY !== undefined && data.totalYoY < 0
      ? `Federal headcount down ${yoyLabel} across the DMV`
      : `DMV federal headcount: ${yoyLabel}`;

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="fed-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#F4EFE5" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
          interval={7} axisLine={{ stroke: '#E7E2D8' }} tickLine={false}
          tickFormatter={(d: string) => `'${d.slice(2, 4)}`} />
        <YAxis tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
          domain={['auto', 'auto']} axisLine={false} tickLine={false} width={56}
          tickFormatter={(v: number) => formatNumber(v)} />
        <Tooltip contentStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)', borderRadius: 8, border: '1px solid #E7E2D8' }}
          formatter={(v) => [formatNumber(Number(v)), 'Federal jobs']} />
        <Area type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={1.5}
          fill="url(#fed-grad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );

  return (
    <DriverCard
      kicker="Federal employment"
      title={title}
      callout={callout}
      calloutColor={calloutColor}
      chart={chart}
      source={`BLS QCEW · DMV total · as of ${data.asOf}`}
    />
  );
}

function MortgageChart({ series }: { series: MetricSeries }) {
  const points = (series.points ?? []).slice(-24).map((p) => ({
    date: p.date.slice(0, 7),
    value: p.value,
  }));
  const latest = points.at(-1)?.value;
  const yearAgo = points[0]?.value;
  const diff = latest !== undefined && yearAgo !== undefined ? latest - yearAgo : undefined;
  const callout = latest !== undefined ? `${latest.toFixed(2)}%` : '—';
  const calloutColor = diff !== undefined ? (diff < 0 ? '#059669' : '#dc2626') : 'var(--fg-1)';

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="mort-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#F4EFE5" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
          interval={5} axisLine={{ stroke: '#E7E2D8' }} tickLine={false}
          tickFormatter={(d: string) => `'${d.slice(2, 4)}`} />
        <YAxis tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }}
          domain={['auto', 'auto']} axisLine={false} tickLine={false} width={36}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
        <Tooltip contentStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)', borderRadius: 8, border: '1px solid #E7E2D8' }}
          formatter={(v) => [typeof v === 'number' ? `${v.toFixed(2)}%` : '', '30-yr rate']} />
        <Area type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={1.5}
          fill="url(#mort-grad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );

  return (
    <DriverCard
      kicker="Mortgage rates"
      title="Rates are down from 2023 peaks — but still historically elevated"
      callout={callout}
      calloutColor={calloutColor}
      chart={chart}
      source="Freddie Mac PMMS · 30-year fixed"
    />
  );
}

export function WhatsDriving({ mortgageRates, fedEmployment, inventory, counties }: WhatsDrivingProps) {
  return (
    <div>
      <SectionHeader
        eyebrow="What's driving the market"
        title="Three forces, pulling in different directions"
        lede="The DMV's housing trajectory in 2026 is shaped by federal-employment shifts, the data center boom in Northern Virginia, and an unusually wide affordability split between tight and softening submarkets."
      />
      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {fedEmployment ? (
          <FedEmploymentChart data={fedEmployment} />
        ) : (
          <Card padding="none" className="p-6 flex flex-col gap-3.5">
            <div className="eyebrow text-fg-3">Federal employment</div>
            <h3 className="font-display text-[22px] font-semibold tracking-tight leading-snug">
              Federal employment data unavailable
            </h3>
            <p className="text-sm text-fg-2 leading-snug">
              QCEW data could not be loaded. Refresh, or check back after the next ingest.
            </p>
          </Card>
        )}
        <MortgageChart series={mortgageRates} />
        {inventory ? (
          <InventoryChart data={inventory} />
        ) : (
          <Card padding="none" className="p-6 flex flex-col gap-3.5">
            <div className="eyebrow text-fg-3">Active inventory</div>
            <h3 className="font-display text-[22px] font-semibold tracking-tight leading-snug">
              Inventory data unavailable
            </h3>
            <p className="text-sm text-fg-2 leading-snug">
              Refresh, or check back after the next ingest.
            </p>
          </Card>
        )}
        {counties && counties.length > 0 ? (
          <AffordabilitySplitChart counties={counties} />
        ) : (
          <Card padding="none" className="p-6 flex flex-col gap-3.5">
            <div className="eyebrow text-fg-3">County affordability split</div>
            <h3 className="font-display text-[22px] font-semibold tracking-tight leading-snug">
              Affordability breakdown by county
            </h3>
            <p className="text-sm text-fg-2 leading-snug">
              County summaries unavailable.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
