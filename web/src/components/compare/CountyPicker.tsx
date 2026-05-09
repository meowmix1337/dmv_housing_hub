import { useState } from 'react';
import type { CountySummary } from '@dmv/shared';
import { JurisdictionBadge } from '../JurisdictionBadge.js';
import { shortName } from '../../lib/county-names.js';

interface CountyPickerProps {
  allCounties: CountySummary[];
  selected: string[];
  onToggle: (fips: string) => void;
}

const GROUPS: Array<{ jur: 'DC' | 'MD' | 'VA'; title: string }> = [
  { jur: 'DC', title: 'District of Columbia' },
  { jur: 'MD', title: 'Maryland' },
  { jur: 'VA', title: 'Virginia' },
];

export function CountyPicker({ allCounties, selected, onToggle }: CountyPickerProps) {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase();

  const matches = (c: CountySummary) =>
    !q || c.name.toLowerCase().includes(q) || shortName(c).toLowerCase().includes(q);

  return (
    <aside
      className="self-start sticky top-20 overflow-y-auto rounded-2xl border border-border-soft bg-surface-1 p-5"
      style={{ maxHeight: 'calc(100vh - 100px)' }}
    >
      <div className="flex justify-between items-baseline mb-1">
        <div className="eyebrow">Counties</div>
        <span className="text-xs text-fg-3 font-mono">{selected.length} / 5</span>
      </div>
      <div className="text-xs text-fg-3 mb-3">Pick 2 to 5 to compare.</div>

      <input
        type="search"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-3 py-2 mb-4 text-[13px] text-fg-1 placeholder-fg-3 bg-paper-50 border border-border-soft rounded-lg focus:outline-none focus:ring-1 focus:ring-fg-1"
      />

      {GROUPS.map(({ jur, title }) => {
        const items = allCounties.filter((c) => c.jurisdiction === jur && matches(c));
        if (items.length === 0) return null;
        return (
          <div key={jur} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <JurisdictionBadge jurisdiction={jur} />
              <span className="eyebrow text-fg-3">{title}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {items.map((c) => {
                const on = selected.includes(c.fips);
                const atCap = !on && selected.length >= 5;
                return (
                  <button
                    key={c.fips}
                    onClick={() => onToggle(c.fips)}
                    disabled={atCap}
                    aria-pressed={on}
                    className={[
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-[13px] transition-colors',
                      on ? 'bg-bg-soft' : 'hover:bg-bg-soft/60',
                      atCap ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'w-4 h-4 rounded-sm flex items-center justify-center shrink-0 border-[1.5px]',
                        on ? 'border-fg-1 bg-fg-1' : 'border-border-strong bg-transparent',
                      ].join(' ')}
                    >
                      {on && <span className="text-white text-[11px] font-bold leading-none">✓</span>}
                    </span>
                    <span className="flex-1 truncate text-fg-1">{shortName(c)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
