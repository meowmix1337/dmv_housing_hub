import type { ReactNode } from 'react';

interface DriverCardProps {
  kicker: string;
  title: string;
  callout?: string;
  calloutColor?: string;
  chart?: ReactNode;
  source?: string;
}

export function DriverCard({ kicker, title, callout, calloutColor = 'var(--fg-1)', chart, source }: DriverCardProps) {
  return (
    <div className="bg-surface-1 rounded-lg border border-border-soft p-6 flex flex-col gap-3.5">
      <div className="eyebrow text-fg-3">{kicker}</div>
      <h3 className="font-display text-[22px] font-semibold tracking-tight leading-snug">{title}</h3>
      {callout && (
        <div className="font-display text-h2 font-semibold tracking-tight leading-tight" style={{ color: calloutColor }}>
          {callout}
        </div>
      )}
      {chart && <div className="h-[140px] mt-1">{chart}</div>}
      {source && <div className="mt-auto pt-2 text-[11px] font-mono text-fg-3">{source}</div>}
    </div>
  );
}
