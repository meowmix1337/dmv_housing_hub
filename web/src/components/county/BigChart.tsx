import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine,
} from 'recharts';
import type { CountySummary } from '@dmv/shared';
import { Source } from '../Source.js';
import { NeighborChip } from './NeighborChip.js';

type Range = 'all' | '20y' | '10y';

const OVERLAY_COLORS: Record<string, string> = {
  metro: '#9A9384', '11001': '#dc2626', '24031': '#A4243B', '24027': '#1f8b54',
  '51059': '#1d4ed8', '51107': '#0f766e', '51013': '#7c3aed', '24033': '#ea580c',
  '24003': '#0891b2', '24021': '#65a30d', '51153': '#be185d',
};

interface BigChartProps {
  county: CountySummary;
  allCounties: CountySummary[];
}

export function BigChart({ county, allCounties }: BigChartProps) {
  const [range, setRange] = useState<Range>('all');
  const [overlays, setOverlays] = useState<string[]>(['metro']);

  const toggle = (id: string) =>
    setOverlays((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const { fips: countyFips, current: countyCurrentMetrics } = county;
  const neighbors = useMemo(() =>
    allCounties
      .filter((c) => c.fips !== countyFips && c.current.zhvi !== undefined)
      .sort((a, b) => Math.abs((a.current.zhvi ?? 0) - (countyCurrentMetrics.zhvi ?? 0)) - Math.abs((b.current.zhvi ?? 0) - (countyCurrentMetrics.zhvi ?? 0)))
      .slice(0, 6),
    [allCounties, countyFips, countyCurrentMetrics],
  );

  const chartData = useMemo(() => {
    const base = county.series.fhfaHpi ?? [];
    const cutYear = range === '20y' ? 2005 : range === '10y' ? 2015 : 0;
    const points = base.filter((p) => parseInt(p.date.slice(0, 4)) > cutYear);

    return points.map((p) => {
      const year = parseInt(p.date.slice(0, 4));
      const row: Record<string, number> = { year, [county.fips]: p.value };
      if (overlays.includes('metro')) {
        const vals = allCounties.map((c) => c.series.fhfaHpi?.find((q) => q.date.slice(0, 4) === p.date.slice(0, 4))?.value).filter((v): v is number => v !== undefined);
        if (vals.length) row['metro'] = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
      }
      neighbors.forEach((n) => {
        if (!overlays.includes(n.fips)) return;
        const pt = n.series.fhfaHpi?.find((q) => q.date.slice(0, 4) === p.date.slice(0, 4));
        if (pt) row[n.fips] = pt.value;
      });
      return row;
    });
  }, [county, allCounties, range, overlays, neighbors]);

  const activeOverlays = ['metro', ...neighbors.map((n) => n.fips)];

  return (
    <div className="bg-surface-1 rounded-lg border border-border-soft overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border-soft flex justify-between items-end gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5">The long view</div>
          <h2 className="font-display text-h2 font-semibold tracking-tight">Home prices since 1975</h2>
          <p className="text-sm text-fg-2 mt-1">FHFA HPI, indexed to 100 in 2000.</p>
        </div>
        <div className="flex gap-1 bg-paper-100 p-1 rounded-sm">
          {(['all', '20y', '10y'] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-xs border-0 cursor-pointer transition-colors ${range === r ? 'bg-surface-1 text-fg-1 shadow-1' : 'bg-transparent text-fg-2 hover:text-fg-1'}`}>
              {r === 'all' ? 'All' : r === '20y' ? '20 yr' : '10 yr'}
            </button>
          ))}
        </div>
      </div>
      <div className="px-6 pt-3 pb-2 flex gap-2 flex-wrap">
        {activeOverlays.map((id) => {
          const label = id === 'metro' ? 'Metro median' : (allCounties.find((c) => c.fips === id)?.name ?? id);
          return <NeighborChip key={id} label={label} color={OVERLAY_COLORS[id] ?? '#9A9384'} active={overlays.includes(id)} onClick={() => toggle(id)} />;
        })}
      </div>
      <div style={{ height: 320 }} className="px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#F4EFE5" vertical={false} />
            {range === 'all' && <ReferenceArea x1={2007} x2={2011} fill="#FEF2F2" fillOpacity={0.6} />}
            <ReferenceLine y={100} stroke="#C9C2B4" strokeDasharray="4 4" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }} axisLine={{ stroke: '#E7E2D8' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9A9384', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)', borderRadius: 8, border: '1px solid #E7E2D8' }} />
            <Line dataKey={county.fips} stroke="#A4243B" strokeWidth={2} dot={false} name={county.name} />
            {overlays.includes('metro') && <Line dataKey="metro" stroke="#9A9384" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Metro median" />}
            {neighbors.filter((n) => overlays.includes(n.fips)).map((n) => (
              <Line key={n.fips} dataKey={n.fips} stroke={OVERLAY_COLORS[n.fips] ?? '#9A9384'} strokeWidth={1.5} dot={false} name={n.name} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Source>Source: U.S. Federal Housing Finance Agency, FHFA HPI · via FRED</Source>
    </div>
  );
}
