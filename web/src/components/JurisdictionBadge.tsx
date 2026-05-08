type Jurisdiction = 'DC' | 'MD' | 'VA';

const STYLES: Record<Jurisdiction, string> = {
  DC: 'bg-crab-50 text-crab-700',
  MD: 'bg-gold-50 text-gold-700',
  VA: 'bg-blue-50 text-blue-700',
};

interface JurisdictionBadgeProps {
  jurisdiction: Jurisdiction;
}

export function JurisdictionBadge({ jurisdiction }: JurisdictionBadgeProps) {
  const cls = STYLES[jurisdiction] ?? 'bg-paper-100 text-fg-2';
  return (
    <span
      className={`inline-flex items-center justify-center font-mono text-xs font-semibold tracking-wide px-2 py-0.5 rounded-xs min-w-[28px] ${cls}`}
    >
      {jurisdiction}
    </span>
  );
}
