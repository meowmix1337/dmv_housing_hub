import { useNavigate } from 'react-router-dom';
import type { CountySummary } from '@dmv/shared';
import { JurisdictionBadge } from '../JurisdictionBadge.js';
import { dirColor } from '../../lib/colors.js';

interface MoversCardProps {
  title: string;
  subtitle: string;
  items: CountySummary[];
  side: 'up' | 'down';
}

export function MoversCard({ title, subtitle, items, side }: MoversCardProps) {
  const navigate = useNavigate();
  const maxAbs = Math.max(...items.map((c) => Math.abs(c.current.zhviYoY ?? 0)));

  return (
    <div className="bg-surface-1 rounded-lg border border-border-soft p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-display text-[18px] font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-fg-3 font-mono">{subtitle}</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((c, i) => {
          const yoy = c.current.zhviYoY ?? 0;
          const pct = yoy * 100;
          const w = maxAbs > 0 ? (Math.abs(yoy) / maxAbs) * 100 : 0;
          const color = dirColor(yoy);
          return (
            <button
              key={c.fips}
              onClick={() => navigate(`/county/${c.fips}`)}
              className="grid items-center gap-3 px-1 py-2 rounded-sm hover:bg-bg-soft text-left w-full"
              style={{ gridTemplateColumns: '16px 1fr 80px 90px' }}
            >
              <span className="font-mono text-[11px] text-fg-3 text-right">{i + 1}</span>
              <div className="flex items-center gap-2 min-w-0">
                <JurisdictionBadge jurisdiction={c.jurisdiction} />
                <span className="text-sm font-medium text-fg-1 truncate">{c.name}</span>
              </div>
              <div className="relative h-3.5 bg-paper-100 rounded-xs overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 rounded-xs"
                  style={{
                    [side === 'up' ? 'left' : 'right']: 0,
                    width: `${w}%`,
                    background: color,
                  }}
                />
              </div>
              <span
                className="font-mono text-sm font-semibold text-right tabular-nums"
                style={{ color }}
              >
                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
