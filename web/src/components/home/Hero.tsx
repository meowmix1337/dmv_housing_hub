import { Card } from '../Card.js';

const BULLETS = [
  'Current prices and 1-year change for all 21 jurisdictions',
  'Long-run trends back to 1975 (FHFA) and 1996 (Zillow)',
  'Affordability calculator with local property-tax rates',
  'Federal-employment exposure, county by county',
  '2026 forecasts shown as ranges, not single numbers',
];

export function Hero() {
  return (
    <div className="border-b border-border-soft bg-bg-paper">
      <div className="max-w-container mx-auto px-8 pt-16 pb-12">
        <div className="grid gap-14 items-end" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
          <div>
            <div className="eyebrow text-fg-3">The DMV housing market</div>
            <h1 className="font-display text-display-lg font-semibold tracking-tight text-fg-1 mt-3 leading-tight max-w-[720px]">
              One metro, twenty-one markets, and the data to tell them apart.
            </h1>
            <p className="mt-5 text-[17px] leading-[1.55] text-fg-2 max-w-[560px]">
              The DMV ended 2025 down roughly 14% in federal jobs while Loudoun became the
              highest-income county in the United States. National averages hide that.
              This dashboard doesn&rsquo;t.
            </p>
          </div>
          <Card padding="dense">
            <div className="eyebrow mb-3">What you&rsquo;ll find here</div>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
              {BULLETS.map((t) => (
                <li key={t} className="flex gap-2.5 text-sm text-fg-2 leading-snug">
                  <span className="text-gold-400 font-bold mt-0.5">—</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
