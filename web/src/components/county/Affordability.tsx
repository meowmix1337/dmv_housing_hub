import { useState } from 'react';
import type { CountySummary } from '@dmv/shared';
import { calcAffordability } from '../../lib/affordability-calc.js';
import { InsufficientData } from '../InsufficientData.js';
import { formatCurrency } from '../../lib/format.js';

interface AffordabilityProps {
  county: CountySummary;
  defaultMortgageRate?: number;
}

function statusPill(ratio: number): { label: string; cls: string } {
  if (ratio <= 0.30) return { label: 'Affordable', cls: 'bg-green-50 text-green-700' };
  if (ratio <= 0.40) return { label: 'Stretched', cls: 'bg-amber-50 text-amber-700' };
  return { label: 'Cost-burdened', cls: 'bg-red-50 text-red-700' };
}

export function Affordability({ county, defaultMortgageRate = 0.0623 }: AffordabilityProps) {
  const [income, setIncome] = useState(county.medianHouseholdIncome ?? 100_000);
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(Math.round(defaultMortgageRate * 1000) / 10);

  const price = county.current.medianSalePrice;
  const taxRate = county.propertyTaxRate;

  if (!price || !taxRate) {
    return <InsufficientData eyebrow="Affordability calculator" caption="Requires median sale price and property tax rate." />;
  }

  const result = calcAffordability({
    medianSalePrice: price,
    propertyTaxRate: taxRate,
    medianHouseholdIncome: income,
    mortgageRate: rate / 100,
    downPaymentPct: downPct / 100,
  });

  const pill = statusPill(result.incomeRatio);

  return (
    <div className="bg-surface-1 rounded-lg border border-border-soft p-6 flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1.5">Affordability calculator</div>
        <h3 className="font-display text-h3 font-semibold tracking-tight">Can you afford it?</h3>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-2">Annual income: {formatCurrency(income)}</span>
          <input type="range" min={40000} max={400000} step={5000} value={income}
            onChange={(e) => setIncome(Number(e.target.value))} className="w-full accent-primary" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-2">Down payment: {downPct}%</span>
          <input type="range" min={3} max={50} step={1} value={downPct}
            onChange={(e) => setDownPct(Number(e.target.value))} className="w-full accent-primary" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-2">Mortgage rate: {rate.toFixed(1)}%</span>
          <input type="range" min={3} max={12} step={0.1} value={rate}
            onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-primary" />
        </label>
      </div>

      <div className="bg-bg-soft rounded-md p-4 flex flex-col gap-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-fg-2">Monthly payment (PITI)</span>
          <span className="font-mono font-semibold text-fg-1">{formatCurrency(result.monthlyPayment)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-fg-2">Share of income</span>
          <span className="font-mono font-semibold text-fg-1">{(result.incomeRatio * 100).toFixed(0)}%</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${pill.cls}`}>{pill.label}</span>
          <span className="text-xs text-fg-3">at current settings</span>
        </div>
      </div>
      <p className="text-xs text-fg-3">List price: {formatCurrency(price)} · Tax: {(taxRate * 100).toFixed(2)}%/yr · Insurance est. 0.35%/yr</p>
    </div>
  );
}
