import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { MetricSeries } from '@dmv/shared';
import type { FederalEmploymentDmv } from '../../api.js';
import { SectionHeader } from '../SectionHeader.js';
import { Card } from '../Card.js';
import { DriverCard } from './DriverCard.js';
import { formatNumber, formatPercent } from '../../lib/format.js';

interface WhatsDrivingProps {
  mortgageRates: MetricSeries;
  fedEmployment?: FederalEmploymentDmv | undefined;
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

export function WhatsDriving({ mortgageRates, fedEmployment }: WhatsDrivingProps) {
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
        <Card padding="none" className="p-6 flex flex-col gap-3.5">
          <div className="eyebrow text-fg-3">Active inventory</div>
          <h3 className="font-display text-[22px] font-semibold tracking-tight leading-snug">
            Regional inventory chart coming soon
          </h3>
          <p className="text-sm text-fg-2 leading-snug">
            County-level active listings are tracked. A regional aggregate time series will be
            added in a future update.
          </p>
        </Card>
        <Card padding="none" className="p-6 flex flex-col gap-3.5">
          <div className="eyebrow text-fg-3">County affordability split</div>
          <h3 className="font-display text-[22px] font-semibold tracking-tight leading-snug">
            Affordability breakdown by county
          </h3>
          <p className="text-sm text-fg-2 leading-snug">
            Coming with federal-employment ingest. Will show the gap between the most and least
            affordable DMV counties.
          </p>
        </Card>
      </div>
    </div>
  );
}
