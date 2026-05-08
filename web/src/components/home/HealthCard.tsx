import { healthColor, SEGMENT_COLORS } from '../../lib/colors.js';

interface HealthCardProps {
  score: number;
}

function healthLabel(score: number): string {
  if (score >= 76) return 'Strong · seller\'s market';
  if (score >= 56) return 'Neutral · normalizing';
  if (score >= 36) return 'Soft · buyer\'s market';
  return 'Weak · significant supply';
}

export function HealthCard({ score }: HealthCardProps) {
  const color = healthColor(score);
  const bucket = score >= 76 ? 3 : score >= 56 ? 2 : score >= 36 ? 1 : 0;

  return (
    <div className="bg-surface-1 rounded-lg border border-border-soft p-5 flex flex-col gap-1.5 min-h-[130px]">
      <div className="text-xs font-medium text-fg-3 uppercase tracking-[0.06em]">Metro market health</div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="font-display text-h1 font-semibold text-fg-1 leading-tight tabular-nums tracking-tight">
          {score}
        </span>
        <span className="text-sm text-fg-3 font-mono">/ 100</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
        <span className="text-sm text-fg-2 font-medium">{healthLabel(score)}</span>
      </div>
      <div className="mt-1.5 flex gap-0.5 h-1.5 rounded-full overflow-hidden">
        {SEGMENT_COLORS.map((c, i) => (
          <div
            key={i}
            className="flex-1"
            style={{ background: i === bucket ? c : 'var(--paper-200)' }}
          />
        ))}
      </div>
      <div className="mt-auto pt-3 text-[11px] font-mono text-fg-3">
        Composite · supply, sale-to-list, inventory
      </div>
    </div>
  );
}
