import { COMPARE_METRICS } from '../../lib/compare-metrics.js';
import type { CompareMetricId } from '../../lib/compare-metrics.js';

interface MetricPickerProps {
  metric: CompareMetricId;
  onSelect: (id: CompareMetricId) => void;
}

export function MetricPicker({ metric, onSelect }: MetricPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {COMPARE_METRICS.map((m) => (
        <button
          key={m.id}
          aria-pressed={metric === m.id}
          onClick={() => onSelect(m.id)}
          className={[
            'px-3 py-1.5 rounded-sm text-sm font-medium transition-colors',
            metric === m.id
              ? 'bg-primary text-white'
              : 'bg-bg-paper border border-border-soft text-fg-2 hover:text-fg-1 hover:border-border-strong',
          ].join(' ')}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
