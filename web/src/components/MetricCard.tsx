export interface MetricCardProps {
  label: string;
  value: string;
  change?: number | undefined;
  changeLabel?: string | undefined;
  sub?: string | undefined;
  source?: string | undefined;
  health?: 'good' | 'caution' | 'poor' | undefined;
}

const HEALTH_CLS: Record<string, string> = {
  good: 'text-green-500',
  caution: 'text-amber-500',
  poor: 'text-red-500',
};

export function MetricCard({
  label,
  value,
  change,
  changeLabel = 'YoY',
  sub,
  source,
  health,
}: MetricCardProps) {
  const changeColor =
    change == null
      ? 'text-fg-3'
      : change >= 0
        ? 'text-green-500'
        : 'text-red-500';

  const formattedChange =
    change == null
      ? null
      : `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;

  return (
    <div className="bg-surface-1 rounded-lg border border-border-soft p-5 flex flex-col gap-1.5 min-h-[130px]">
      <div className="text-xs font-medium text-fg-3 uppercase tracking-[0.06em]">{label}</div>
      <div
        className={`font-display text-h1 font-semibold text-fg-1 leading-tight tabular-nums tracking-tight mt-0.5 ${health ? HEALTH_CLS[health] ?? '' : ''}`}
      >
        {value}
      </div>
      {formattedChange != null && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className={`font-semibold font-mono tabular-nums ${changeColor}`}>
            {formattedChange}
          </span>
          <span className="text-fg-3">{changeLabel}</span>
        </div>
      )}
      {sub != null && formattedChange == null && (
        <div className="text-sm text-fg-3">{sub}</div>
      )}
      {source != null && (
        <div className="mt-auto pt-3 text-[11px] font-mono text-fg-3">{source}</div>
      )}
    </div>
  );
}
