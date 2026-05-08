import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import type { CountySummary } from '@dmv/shared';
import { getCountySummary } from '../api.js';
import { DMV_FIPS } from '../lib/fips.js';
import { Container } from '../components/Container.js';
import { JurisdictionBadge } from '../components/JurisdictionBadge.js';
import { formatCurrency } from '../lib/format.js';

const JURISDICTIONS = ['DC', 'MD', 'VA'] as const;

function CountyCard({ county }: { county: CountySummary }) {
  return (
    <Link
      to={`/county/${county.fips}`}
      className="block rounded-lg border border-border-soft bg-bg-paper p-4 no-underline transition-shadow hover:shadow-2"
    >
      <div className="mb-2 flex items-center gap-2">
        <JurisdictionBadge jurisdiction={county.jurisdiction} />
        <span className="text-xs font-mono text-fg-3">{county.fips}</span>
      </div>
      <p className="mb-3 font-medium text-fg-1">{county.name}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-3">
        {county.current.zhvi !== undefined && (
          <>
            <span>Typical value</span>
            <span className="text-right font-mono text-fg-2">{formatCurrency(county.current.zhvi)}</span>
          </>
        )}
        {county.current.daysOnMarket !== undefined && (
          <>
            <span>Days on market</span>
            <span className="text-right font-mono text-fg-2">{county.current.daysOnMarket} days</span>
          </>
        )}
        {county.current.marketHealthScore !== undefined && (
          <>
            <span>Market health</span>
            <span className="text-right font-mono text-fg-2">{Math.round(county.current.marketHealthScore)} / 100</span>
          </>
        )}
      </div>
    </Link>
  );
}

export function Counties() {
  const [query, setQuery] = useState('');

  const results = useQueries({
    queries: DMV_FIPS.map((fips) => ({
      queryKey: ['county', fips] as const,
      queryFn: () => getCountySummary(fips),
    })),
  });

  const allCounties = results.map((r) => r.data).filter((d): d is CountySummary => d !== undefined);
  const q = query.toLowerCase();
  const filtered = allCounties.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.fips.includes(q) || c.jurisdiction.toLowerCase().includes(q),
  );

  return (
    <div className="bg-bg-paper min-h-screen py-8">
      <Container>
        <h1 className="mb-1 font-display text-3xl font-semibold text-fg-1">All counties</h1>
        <p className="mb-6 text-sm text-fg-3">
          {allCounties.length} jurisdictions across the DMV region.
        </p>

        <input
          type="search"
          placeholder="Search by name or FIPS…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search counties"
          className="mb-8 w-full max-w-sm rounded-sm border border-border-soft bg-bg-paper px-3 py-2 text-sm text-fg-1 placeholder-fg-3 focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {JURISDICTIONS.map((j) => {
          const group = filtered.filter((c) => c.jurisdiction === j);
          if (group.length === 0) return null;
          return (
            <section key={j} className="mb-10">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-fg-3">{j}</h2>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {group.map((c) => <CountyCard key={c.fips} county={c} />)}
              </div>
            </section>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-fg-3">No counties match your search.</p>
        )}
      </Container>
    </div>
  );
}
