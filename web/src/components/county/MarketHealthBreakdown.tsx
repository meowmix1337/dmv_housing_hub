import type { CountySummary } from '@dmv/shared';
import { healthColor, SEGMENT_COLORS } from '../../lib/colors.js';
import { InsufficientData } from '../InsufficientData.js';

interface SubScore { label: string; score: number; weight: number }

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function computeSubScores(current: CountySummary['current']): SubScore[] | null {
  const subs: SubScore[] = [];
  if (current.monthsSupply !== undefined)
    subs.push({ label: 'Months of supply', score: clamp(100 - (current.monthsSupply - 1) * 18, 0, 100), weight: 30 });
  if (current.saleToListRatio !== undefined)
    subs.push({ label: 'Sale-to-list ratio', score: clamp(60 + (1 - (1 - current.saleToListRatio) * 50) * 0.4, 0, 100), weight: 25 });
  if (current.pctSoldAboveList !== undefined)
    subs.push({ label: '% sold above list', score: clamp(current.pctSoldAboveList * 200, 0, 100), weight: 20 });
  return subs.length >= 2 ? subs : null;
}

interface DonutProps { score: number }
function Donut({ score }: DonutProps) {
  const r = 36, cx = 44, cy = 44, stroke = 10;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = healthColor(score);
  return (
    <svg width={88} height={88} viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--paper-200)" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, fill: 'var(--fg-1)' }}>
        {score}
      </text>
    </svg>
  );
}

interface MarketHealthBreakdownProps { county: CountySummary }

export function MarketHealthBreakdown({ county }: MarketHealthBreakdownProps) {
  const score = county.current.marketHealthScore;
  if (score === undefined) {
    return <InsufficientData eyebrow="Market health" caption="Requires supply and sale-to-list data." />;
  }
  const subs = computeSubScores(county.current);

  return (
    <div className="bg-surface-1 rounded-lg border border-border-soft p-6 flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1.5">Market health</div>
        <h3 className="font-display text-h3 font-semibold tracking-tight">Supply vs. demand balance</h3>
      </div>
      <div className="flex items-center gap-6">
        <Donut score={Math.round(score)} />
        <div className="flex flex-col gap-1">
          <div className="flex gap-1.5 h-1.5 w-40 rounded-full overflow-hidden">
            {SEGMENT_COLORS.map((c, i) => {
              const bucket = score >= 76 ? 3 : score >= 56 ? 2 : score >= 36 ? 1 : 0;
              return <div key={i} className="flex-1" style={{ background: i === bucket ? c : 'var(--paper-200)' }} />;
            })}
          </div>
          <span className="text-sm text-fg-2">
            {score >= 76 ? "Strong seller's market" : score >= 56 ? "Neutral — normalizing" : score >= 36 ? "Soft buyer's market" : "Weak — oversupply"}
          </span>
        </div>
      </div>
      {subs && (
        <div className="flex flex-col gap-2">
          {subs.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-xs text-fg-3 w-36 shrink-0">{s.label}</span>
              <div className="flex-1 h-2 bg-paper-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.score}%`, background: healthColor(s.score) }} />
              </div>
              <span className="text-xs font-mono text-fg-2 w-8 text-right">{Math.round(s.score)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-fg-3 mt-auto">Composite score · supply, sale-to-list, above-list %</p>
    </div>
  );
}
