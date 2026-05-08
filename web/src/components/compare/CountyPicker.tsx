import { useState } from 'react';
import type { CountySummary } from '@dmv/shared';

interface CountyPickerProps {
  allCounties: CountySummary[];
  selected: string[];
  onToggle: (fips: string) => void;
}

const JURISDICTION_ORDER = ['DC', 'MD', 'VA'] as const;
type Jurisdiction = typeof JURISDICTION_ORDER[number];

export function CountyPicker({ allCounties, selected, onToggle }: CountyPickerProps) {
  const [query, setQuery] = useState('');
  const atCap = selected.length >= 5;

  const groups = JURISDICTION_ORDER.reduce<Record<Jurisdiction, CountySummary[]>>(
    (acc, j) => ({ ...acc, [j]: [] }),
    { DC: [], MD: [], VA: [] },
  );
  for (const c of allCounties) {
    const j = c.jurisdiction as Jurisdiction;
    if (j in groups) groups[j].push(c);
  }

  const q = query.toLowerCase();
  const matches = (c: CountySummary) =>
    !q || c.name.toLowerCase().includes(q) || c.fips.includes(q);

  return (
    <aside
      className="w-80 shrink-0 self-start sticky top-20 overflow-y-auto rounded-lg border border-border-soft bg-bg-paper p-4"
      style={{ maxHeight: 'calc(100vh - 100px)' }}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-3">
        Counties {selected.length > 0 && <span>({selected.length}/5)</span>}
      </p>

      <input
        type="search"
        placeholder="Search counties…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full rounded-sm border border-border-soft bg-bg-paper px-3 py-1.5 text-sm text-fg-1 placeholder-fg-3 focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {JURISDICTION_ORDER.map((j) => {
        const counties = groups[j].filter(matches);
        if (counties.length === 0) return null;
        return (
          <div key={j} className="mb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-3">{j}</p>
            {counties.map((c) => {
              const checked = selected.includes(c.fips);
              const disabled = atCap && !checked;
              return (
                <label
                  key={c.fips}
                  aria-disabled={disabled}
                  className={[
                    'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg-subtle',
                    disabled ? 'cursor-not-allowed opacity-40' : '',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(c.fips)}
                    className="accent-primary"
                  />
                  <span className={checked ? 'font-medium text-fg-1' : 'text-fg-2'}>{c.name}</span>
                </label>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}
