import { useQuery } from '@tanstack/react-query';
import type { Cadence, ManifestSourceEntry } from '@dmv/shared';
import { getManifest } from '../api.js';

const STALE_DAYS_BY_CADENCE: Record<Cadence, number> = {
  daily: 5,
  weekly: 14,
  monthly: 35,
  quarterly: 100,
  annual: 400,
};

function isStale(entry: ManifestSourceEntry, now: Date): boolean {
  const updated = new Date(entry.lastUpdated);
  if (Number.isNaN(updated.getTime())) return true;
  const ageDays = (now.getTime() - updated.getTime()) / 86_400_000;
  return ageDays > STALE_DAYS_BY_CADENCE[entry.cadence];
}

export function FreshnessBanner() {
  const { data } = useQuery({ queryKey: ['manifest'] as const, queryFn: getManifest });
  if (!data) return null;

  const now = new Date();
  const stale = data.sources.filter((s) => isStale(s, now));
  if (stale.length === 0) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-xs font-mono text-amber-900">
      Some upstream data is stale: {stale.map((s) => s.name).join(', ')}. Last full refresh:{' '}
      {new Date(data.generatedAt).toLocaleDateString()}.
    </div>
  );
}
