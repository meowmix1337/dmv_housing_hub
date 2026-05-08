interface NeighborChipProps {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}

export function NeighborChip({ label, color, active, onClick }: NeighborChipProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'text-fg-1 border-transparent'
          : 'text-fg-3 border-border-soft bg-surface-1 hover:text-fg-2'
      }`}
      style={active ? { background: color + '22', borderColor: color, color } : undefined}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </button>
  );
}
