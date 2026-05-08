import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { COMPARE_METRICS } from '../lib/compare-metrics.js';
import type { CompareMetricId } from '../lib/compare-metrics.js';

const MAX_COUNTIES = 5;

export interface CompareState {
  selected: string[];
  metric: CompareMetricId;
  toggle: (fips: string) => void;
  setMetric: (id: CompareMetricId) => void;
}

export function useCompareState(): CompareState {
  const [params, setParams] = useSearchParams();

  const selected = (params.get('counties') ?? '')
    .split(',')
    .filter(Boolean)
    .slice(0, MAX_COUNTIES);

  const metricParam = params.get('metric') ?? '';
  const metric = (COMPARE_METRICS.find((m) => m.id === metricParam)?.id) ?? 'zhvi';

  const update = useCallback(
    (next: Partial<{ counties: string[]; metric: CompareMetricId }>) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (next.counties !== undefined) {
          if (next.counties.length > 0) p.set('counties', next.counties.join(','));
          else p.delete('counties');
        }
        if (next.metric !== undefined) p.set('metric', next.metric);
        return p;
      });
    },
    [setParams],
  );

  const toggle = useCallback(
    (fips: string) => {
      const current = (params.get('counties') ?? '').split(',').filter(Boolean).slice(0, MAX_COUNTIES);
      if (current.includes(fips)) {
        update({ counties: current.filter((f) => f !== fips) });
      } else if (current.length < MAX_COUNTIES) {
        update({ counties: [...current, fips] });
      }
    },
    [params, update],
  );

  const setMetric = useCallback(
    (id: CompareMetricId) => update({ metric: id }),
    [update],
  );

  return { selected, metric, toggle, setMetric };
}
