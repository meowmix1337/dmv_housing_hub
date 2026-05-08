export function EmptyState() {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-paper py-24 text-center">
      <div>
        <p className="text-lg font-medium text-fg-1">Pick at least 2 counties</p>
        <p className="mt-1 text-sm text-fg-3">Select counties from the left panel to compare them.</p>
      </div>
    </div>
  );
}
