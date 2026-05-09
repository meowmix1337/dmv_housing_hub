import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CountySummary } from '@dmv/shared';
import { JurisdictionBadge } from './JurisdictionBadge.js';
import { formatCurrency, formatPercent } from '../lib/format.js';

type HexMetric = 'yoy' | 'zhvi' | 'health' | 'dom' | 'supply';

const HEX_LAYOUT: ReadonlyArray<{ fips: string; col: number; row: number }> = [
  { fips: '24021', col: 2, row: 0 }, // Frederick
  { fips: '24027', col: 4, row: 0 }, // Howard
  { fips: '24005', col: 5, row: 0 }, // Baltimore Co.
  { fips: '24510', col: 6, row: 0 }, // Baltimore City
  { fips: '24031', col: 3, row: 1 }, // Montgomery
  { fips: '24003', col: 5, row: 1 }, // Anne Arundel
  { fips: '51107', col: 0, row: 2 }, // Loudoun
  { fips: '51059', col: 2, row: 2 }, // Fairfax County
  { fips: '11001', col: 3, row: 2 }, // DC
  { fips: '24033', col: 4, row: 2 }, // Prince George's
  { fips: '51153', col: 1, row: 3 }, // Prince William
  { fips: '51600', col: 2, row: 3 }, // Fairfax City
  { fips: '51610', col: 3, row: 3 }, // Falls Church
  { fips: '51013', col: 4, row: 3 }, // Arlington
  { fips: '51510', col: 5, row: 3 }, // Alexandria
  { fips: '24009', col: 6, row: 3 }, // Calvert
  { fips: '51683', col: 0, row: 4 }, // Manassas
  { fips: '51685', col: 1, row: 4 }, // Manassas Park
  { fips: '24017', col: 5, row: 4 }, // Charles
  { fips: '51179', col: 1, row: 5 }, // Stafford
  { fips: '51177', col: 2, row: 5 }, // Spotsylvania
];

const METRICS: ReadonlyArray<{ id: HexMetric; label: string }> = [
  { id: 'yoy', label: '1-yr price change' },
  { id: 'zhvi', label: 'Typical home value' },
  { id: 'health', label: 'Market health (0–100)' },
  { id: 'dom', label: 'Days on market' },
  { id: 'supply', label: 'Months of supply' },
];

const JURISDICTION_COLORS: Record<string, string> = {
  DC: '#dc2626',
  MD: '#ca8a04',
  VA: '#1d4ed8',
};

function valueOf(c: CountySummary, metric: HexMetric): number | undefined {
  switch (metric) {
    case 'yoy': return c.current.zhviYoY;
    case 'zhvi': return c.current.zhvi;
    case 'health': return c.current.marketHealthScore;
    case 'dom': return c.current.daysOnMarket;
    case 'supply': return c.current.monthsSupply;
  }
}

function fmtMetricValue(v: number | undefined, metric: HexMetric): string {
  if (v == null) return '—';
  switch (metric) {
    case 'yoy': return formatPercent(v);
    case 'zhvi': return formatCurrency(v);
    case 'health': return `${Math.round(v)} / 100`;
    case 'dom': return `${Math.round(v)} days`;
    case 'supply': return `${v.toFixed(1)} mo`;
  }
}

function colorFor(c: CountySummary, metric: HexMetric): string {
  const v = valueOf(c, metric);
  if (v == null) return '#E7E2D8';
  switch (metric) {
    case 'yoy': {
      if (v <= -0.04) return '#7f1d1d';
      if (v <= -0.02) return '#b91c1c';
      if (v <= -0.005) return '#ef4444';
      if (v < 0.005) return '#e5e7eb';
      if (v < 0.015) return '#a7d3b0';
      if (v < 0.03) return '#34a36b';
      if (v < 0.045) return '#1f8b54';
      return '#065f46';
    }
    case 'zhvi': {
      const t = Math.min(1, Math.max(0, (v - 180000) / (950000 - 180000)));
      const stops = ['#FBF8F3', '#F4D2D7', '#E8A4AE', '#BE4A5C', '#8B1A2F', '#4F0E1A'];
      return stops[Math.min(stops.length - 1, Math.floor(t * (stops.length - 1)))]!;
    }
    case 'health': {
      if (v < 36) return '#dc2626';
      if (v < 56) return '#d97706';
      if (v < 76) return '#1d4ed8';
      return '#059669';
    }
    case 'dom':
    case 'supply': {
      const [lo, hi] = metric === 'dom' ? [20, 70] : [1, 6];
      const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      const stops = ['#065f46', '#1f8b54', '#a7d3b0', '#fde68a', '#f59e0b', '#b45309'];
      return stops[Math.min(stops.length - 1, Math.floor(t * (stops.length - 1)))]!;
    }
  }
}

const LEGEND_STOPS: Record<HexMetric, { labels: string[]; colors: string[] }> = {
  yoy: { labels: ['-4%', '-2%', '0', '+2%', '+4%', '+6%'], colors: ['#b91c1c', '#ef4444', '#e5e7eb', '#34a36b', '#1f8b54', '#065f46'] },
  zhvi: { labels: ['$180K', '$350K', '$500K', '$650K', '$800K', '$950K'], colors: ['#FBF8F3', '#F4D2D7', '#E8A4AE', '#BE4A5C', '#8B1A2F', '#4F0E1A'] },
  health: { labels: ['0', '20', '40', '60', '80', '100'], colors: ['#dc2626', '#dc2626', '#d97706', '#1d4ed8', '#059669', '#059669'] },
  dom: { labels: ['20', '30', '40', '50', '60', '70'], colors: ['#065f46', '#1f8b54', '#a7d3b0', '#fde68a', '#f59e0b', '#b45309'] },
  supply: { labels: ['1', '2', '3', '4', '5', '6'], colors: ['#065f46', '#1f8b54', '#a7d3b0', '#fde68a', '#f59e0b', '#b45309'] },
};

function hexPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

// Approximate luminance — picks white vs ink text for contrast
function luminance(hex: string): number {
  if (!hex || hex[0] !== '#') return 1;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

interface HexMapProps {
  counties?: CountySummary[];
}

export function HexMap({ counties = [] }: HexMapProps) {
  const navigate = useNavigate();
  const [metric, setMetric] = useState<HexMetric>('yoy');
  const [hoverFips, setHoverFips] = useState<string | null>(null);

  const byFips = useMemo(
    () => Object.fromEntries(counties.map((c) => [c.fips, c])),
    [counties],
  );

  const HEX_R = 46;
  const COL_W = HEX_R * Math.sqrt(3);
  const ROW_H = HEX_R * 1.5;
  const PAD = 56;

  const cells = HEX_LAYOUT.flatMap((h) => {
    const c = byFips[h.fips];
    if (!c) return [];
    const offset = h.row % 2 === 1 ? COL_W / 2 : 0;
    return [{ fips: h.fips, c, cx: PAD + h.col * COL_W + offset, cy: PAD + h.row * ROW_H }];
  });

  if (cells.length === 0) {
    return (
      <div className="rounded-2xl border border-border-soft bg-surface-1 p-12 text-center text-fg-3">
        Loading county data…
      </div>
    );
  }

  const maxX = Math.max(...cells.map((c) => c.cx)) + HEX_R + 40;
  const maxY = Math.max(...cells.map((c) => c.cy)) + HEX_R + 40;
  const hovered = hoverFips ? byFips[hoverFips] ?? null : null;
  const legend = LEGEND_STOPS[metric];

  return (
    <div className="rounded-2xl border border-border-soft bg-surface-1 overflow-hidden">
      <div className="px-6 py-5 border-b border-border-soft flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5">The metro at a glance</div>
          <h2 className="font-display text-[26px] font-semibold tracking-tight text-fg-1">21 counties, one map</h2>
          <p className="text-sm text-fg-2 mt-1 max-w-[560px]">
            Each hex is one jurisdiction, arranged by rough adjacency. Click any to dive in.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-xs text-fg-3 font-mono">Color encodes</div>
          <div className="flex gap-1 flex-wrap">
            {METRICS.map((m) => {
              const active = metric === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMetric(m.id)}
                  className={`px-3 py-1.5 text-[13px] font-medium rounded-lg border transition-colors ${
                    active
                      ? 'bg-ink-900 text-paper-100 border-ink-900'
                      : 'bg-surface-1 text-fg-2 border-border-soft hover:text-fg-1'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] min-h-[520px]">
        <div className="relative p-6 bg-paper-50">
          <svg viewBox={`0 0 ${maxX} ${maxY}`} className="w-full h-auto block">
            {cells.map(({ c, cx, cy }) => {
              const fill = colorFor(c, metric);
              const isHover = hoverFips === c.fips;
              const labelColor = luminance(fill) > 0.55 ? '#2B201A' : '#fff';
              const display = c.name.length > 12 ? `${c.name.slice(0, 11)}…` : c.name;
              return (
                <g
                  key={c.fips}
                  onMouseEnter={() => setHoverFips(c.fips)}
                  onMouseLeave={() => setHoverFips(null)}
                  onClick={() => navigate(`/county/${c.fips}`)}
                  className="cursor-pointer"
                >
                  <path
                    d={hexPath(cx, cy, HEX_R)}
                    fill={fill}
                    stroke={isHover ? '#2B201A' : 'rgba(43,32,26,0.18)'}
                    strokeWidth={isHover ? 2.5 : 1}
                    style={{ transition: 'stroke-width 150ms' }}
                  />
                  <circle
                    cx={cx - HEX_R * 0.55}
                    cy={cy - HEX_R * 0.55}
                    r={3.5}
                    fill={JURISDICTION_COLORS[c.jurisdiction] ?? '#888'}
                    opacity={0.85}
                  />
                  <text
                    x={cx}
                    y={cy - 4}
                    textAnchor="middle"
                    fontFamily="var(--font-body)"
                    fontSize={10}
                    fontWeight={600}
                    fill={labelColor}
                  >
                    {display}
                  </text>
                  <text
                    x={cx}
                    y={cy + 11}
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                    fontSize={11}
                    fontWeight={600}
                    fill={labelColor}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmtMetricValue(valueOf(c, metric), metric)}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="absolute bottom-6 left-6 right-6 max-w-[480px] flex items-center gap-3 bg-white/90 border border-border-soft rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] text-fg-3 font-mono whitespace-nowrap">{METRICS.find((m) => m.id === metric)!.label}</div>
            <div className="flex flex-1 gap-0">
              {legend.colors.map((color, i) => (
                <div key={i} style={{ flex: 1, height: 10, background: color }} />
              ))}
            </div>
            <div className="flex justify-between flex-1 text-[10px] text-fg-3 font-mono">
              {legend.labels.map((s, i) => (
                <span
                  key={i}
                  style={{ flex: 1, textAlign: i === 0 ? 'left' : i === legend.labels.length - 1 ? 'right' : 'center' }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <aside className="border-t lg:border-t-0 lg:border-l border-border-soft p-6 bg-surface-1">
          {hovered ? <DetailRail county={hovered} /> : <DefaultRail />}
        </aside>
      </div>
    </div>
  );
}

function DetailRail({ county }: { county: CountySummary }) {
  const { current } = county;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <JurisdictionBadge jurisdiction={county.jurisdiction} />
        <span className="text-[11px] text-fg-3 font-mono">FIPS {county.fips}</span>
      </div>
      <h3 className="font-display text-[22px] font-semibold tracking-tight text-fg-1">{county.name}</h3>
      <div className="mt-4 flex flex-col gap-3.5">
        {current.zhvi !== undefined && (
          <DetailRow
            k="Typical home value"
            v={formatCurrency(current.zhvi)}
            sub={current.zhviYoY !== undefined ? `${formatPercent(current.zhviYoY)} YoY` : undefined}
            subColor={current.zhviYoY !== undefined ? (current.zhviYoY >= 0 ? '#059669' : '#dc2626') : undefined}
          />
        )}
        {current.medianSalePrice !== undefined && (
          <DetailRow k="Median sale price" v={formatCurrency(current.medianSalePrice)} />
        )}
        {current.daysOnMarket !== undefined && (
          <DetailRow k="Days on market" v={`${Math.round(current.daysOnMarket)} days`} />
        )}
        {current.monthsSupply !== undefined && (
          <DetailRow k="Months of supply" v={`${current.monthsSupply.toFixed(1)} mo`} />
        )}
        {current.marketHealthScore !== undefined && (
          <DetailRow
            k="Market health"
            v={`${Math.round(current.marketHealthScore)} / 100`}
            sub="●"
            subColor={colorFor(county, 'health')}
          />
        )}
      </div>
    </div>
  );
}

function DefaultRail() {
  return (
    <div>
      <div className="eyebrow mb-3">Hover or click a hex</div>
      <p className="text-sm text-fg-2 leading-relaxed mb-6">
        Hover any jurisdiction to see its current snapshot. Click to open the county detail page.
      </p>
      <div className="eyebrow mb-2">Jurisdictions</div>
      <div className="flex flex-col gap-2 text-[13px]">
        <LegendRow color={JURISDICTION_COLORS.DC!} label="District of Columbia" n="1" />
        <LegendRow color={JURISDICTION_COLORS.MD!} label="Maryland" n="9" />
        <LegendRow color={JURISDICTION_COLORS.VA!} label="Virginia" n="11" />
      </div>
      <div className="mt-6 px-4 py-3.5 bg-bg-soft rounded-[10px] text-[13px] text-fg-2 leading-relaxed">
        <strong className="text-fg-1">Reading the map.</strong>{' '}
        Adjacency is approximate; the goal is to make jurisdictional contrast legible, not to be a true cartographic projection.
      </div>
    </div>
  );
}

function DetailRow({ k, v, sub, subColor }: { k: string; v: string; sub?: string; subColor?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3 pb-3 border-b border-border-soft">
      <span className="text-[13px] text-fg-3">{k}</span>
      <span className="text-right">
        <span className="font-mono text-sm font-semibold text-fg-1 tabular-nums">{v}</span>
        {sub && (
          <span className="ml-1.5 text-xs font-mono" style={{ color: subColor ?? 'var(--fg-3)' }}>
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}

function LegendRow({ color, label, n }: { color: string; label: string; n: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-fg-2">{label}</span>
      <span className="ml-auto font-mono text-xs text-fg-3">{n}</span>
    </div>
  );
}

export default HexMap;
