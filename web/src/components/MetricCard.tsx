export interface MetricCardProps {
  label: string;
  value: string;
  delta?: string | undefined;
  deltaLabel?: string | undefined;
}

export function MetricCard({ label, value, delta, deltaLabel }: MetricCardProps) {
  const isNegative = delta?.startsWith('-');
  const deltaColor = delta
    ? isNegative
      ? 'text-red-600'
      : 'text-emerald-600'
    : 'text-neutral-400';

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {delta && (
        <div className={`mt-1 text-sm tabular-nums ${deltaColor}`}>
          {delta}
          {deltaLabel ? <span className="text-neutral-400 ml-1">{deltaLabel}</span> : null}
        </div>
      )}
    </div>
  );
}
