import type { ReactNode } from 'react';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}

export function SectionHeader({ eyebrow, title, lede, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-8 mb-6">
      <div className="max-w-[720px]">
        {eyebrow && (
          <div className="eyebrow mb-2">{eyebrow}</div>
        )}
        <h2 className="font-display text-h2 font-semibold tracking-tight text-fg-1">{title}</h2>
        {lede && (
          <p className="mt-2 text-sm text-fg-2 leading-snug max-w-reading">{lede}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
