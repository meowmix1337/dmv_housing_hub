interface InsufficientDataProps {
  eyebrow?: string;
  caption?: string;
}

export function InsufficientData({ eyebrow = 'Insufficient data', caption }: InsufficientDataProps) {
  return (
    <div data-testid="insufficient-data" className="bg-surface-1 rounded-lg border border-dashed border-border-strong p-8 flex flex-col items-center text-center gap-2">
      <div className="eyebrow text-fg-3">{eyebrow}</div>
      <p className="text-sm text-fg-3 max-w-reading">
        {caption ?? 'This metric requires additional data fields that are not yet available for this county.'}
      </p>
    </div>
  );
}
