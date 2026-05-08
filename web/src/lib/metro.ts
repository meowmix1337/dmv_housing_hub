import type { CountySummary, MetricSeries } from '@dmv/shared';

export interface MetroSnapshot {
  medianSalePrice: number | undefined;
  medianSalePriceYoY: number | undefined;
  mortgageRate: number | undefined;
  mortgageRateYoY: number | undefined;
  activeListings: number | undefined;
  activeListingsYoY: number | undefined;
  daysOnMarket: number | undefined;
  marketHealth: number | undefined;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

export function deriveMetroSnapshot(
  counties: CountySummary[],
  mortgageRates: MetricSeries,
): MetroSnapshot {
  const salePrices = counties.map((c) => c.current.medianSalePrice).filter((v): v is number => v != null);
  const salePriceYoYs = counties.map((c) => c.current.medianSalePriceYoY).filter((v): v is number => v != null);
  const listingCounts = counties.map((c) => {
    const pts = (c.series as Record<string, unknown>);
    const active = pts.activeListings as Array<{ value: number }> | undefined;
    return active?.at(-1)?.value;
  }).filter((v): v is number => v != null);
  const domValues = counties.map((c) => c.current.daysOnMarket).filter((v): v is number => v != null);
  const healthScores = counties.map((c) => c.current.marketHealthScore).filter((v): v is number => v != null);

  const latestRate = mortgageRates.points?.at(-1);
  const yearAgoIdx = mortgageRates.points
    ? mortgageRates.points.length - 53
    : -1;
  const yearAgoRate = yearAgoIdx >= 0 ? mortgageRates.points?.[yearAgoIdx] : undefined;
  const mortgageRate = latestRate ? latestRate.value / 100 : undefined;
  const mortgageRateYoY =
    latestRate && yearAgoRate
      ? (latestRate.value - yearAgoRate.value) / yearAgoRate.value
      : undefined;

  return {
    medianSalePrice: median(salePrices),
    medianSalePriceYoY: median(salePriceYoYs),
    mortgageRate,
    mortgageRateYoY,
    activeListings: listingCounts.reduce((a, b) => a + b, 0) || undefined,
    activeListingsYoY: median(salePriceYoYs),
    daysOnMarket: median(domValues),
    marketHealth: median(healthScores),
  };
}
