import { useNavigate } from 'react-router-dom';
import type { CountySummary } from '@dmv/shared';
import { JurisdictionBadge } from '../JurisdictionBadge.js';
import { InsufficientData } from '../InsufficientData.js';
import { formatCurrency, formatDate } from '../../lib/format.js';

interface KVRowProps { label: string; value: string; last?: boolean }
function KVRow({ label, value, last }: KVRowProps) {
  return (
    <div className={`flex justify-between items-baseline py-1.5 ${!last ? 'border-b border-border-soft' : ''}`}>
      <span className="text-xs text-fg-3">{label}</span>
      <span className="font-mono text-sm font-semibold text-fg-1 tabular-nums">{value}</span>
    </div>
  );
}

interface CountyHeaderProps {
  county: CountySummary;
}

export function CountyHeader({ county }: CountyHeaderProps) {
  const navigate = useNavigate();
  const hasAtAGlance =
    county.medianHouseholdIncome !== undefined || county.propertyTaxRate !== undefined;

  return (
    <div className="border-b border-border-soft bg-bg-paper">
      <div className="max-w-container mx-auto px-8 pt-8 pb-8">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-fg-2 bg-transparent border-0 p-0 cursor-pointer mb-4 hover:text-fg-1"
        >
          ← Back to overview
        </button>
        <div className="grid gap-12 items-end" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <JurisdictionBadge jurisdiction={county.jurisdiction} />
              <span className="text-xs text-fg-3 font-mono">FIPS {county.fips}</span>
              {county.population !== undefined && (
                <>
                  <span className="text-xs text-fg-3">·</span>
                  <span className="text-xs text-fg-3 font-mono">
                    Pop. {county.population.toLocaleString('en-US')}
                  </span>
                </>
              )}
            </div>
            <h1 className="font-display text-display-md font-semibold tracking-tight text-fg-1 leading-tight">
              {county.name}
            </h1>
            <p className="mt-3.5 text-base text-fg-2 leading-snug max-w-[620px]">
              Housing market data for {county.name}, {county.jurisdiction}. Updated {formatDate(county.lastUpdated)}.
            </p>
          </div>
          {hasAtAGlance ? (
            <div className="bg-surface-1 border border-border-soft rounded-md p-4 text-sm">
              <div className="eyebrow mb-2.5">At a glance</div>
              {county.medianHouseholdIncome !== undefined && (
                <KVRow label="Median household income" value={formatCurrency(county.medianHouseholdIncome)} />
              )}
              {county.propertyTaxRate !== undefined && (
                <KVRow
                  label="Property tax rate"
                  value={`${(county.propertyTaxRate * 100).toFixed(2)}%`}
                  last
                />
              )}
            </div>
          ) : (
            <InsufficientData eyebrow="At a glance" caption="Income and property tax data not yet available." />
          )}
        </div>
      </div>
    </div>
  );
}
