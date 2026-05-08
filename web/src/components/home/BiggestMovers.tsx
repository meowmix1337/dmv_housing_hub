import type { CountySummary } from '@dmv/shared';
import { SectionHeader } from '../SectionHeader.js';
import { Source } from '../Source.js';
import { MoversCard } from './MoversCard.js';

interface BiggestMoversProps {
  counties: CountySummary[];
}

export function BiggestMovers({ counties }: BiggestMoversProps) {
  const withYoY = counties.filter((c) => c.current.zhviYoY !== undefined);
  const sorted = [...withYoY].sort((a, b) => (b.current.zhviYoY ?? 0) - (a.current.zhviYoY ?? 0));
  const gainers = sorted.slice(0, 5);
  const losers = sorted.slice(-5).reverse();

  return (
    <div>
      <SectionHeader
        eyebrow="Year-over-year movers"
        title="Where home values rose and fell the most"
        lede="The metro is splitting. The tight-supply corridors and the federal-commuter exurbs are telling different stories. Check individual county pages for the full picture."
      />
      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <MoversCard
          title="Largest gains"
          subtitle="Top 5 by ZHVI 1-year change"
          items={gainers}
          side="up"
        />
        <MoversCard
          title="Largest declines"
          subtitle="Bottom 5 by ZHVI 1-year change"
          items={losers}
          side="down"
        />
      </div>
      <Source>Source: Zillow Research, ZHVI (All Homes, Smoothed). 1-year change.</Source>
    </div>
  );
}
