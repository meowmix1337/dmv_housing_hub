interface MarketHealthInput {
  monthsSupply?: number;
  saleToListRatio?: number;
  pctSoldAboveList?: number;
  inventoryYoY?: number;
}

export function marketHealthScore(input: MarketHealthInput): number | undefined {
  const { monthsSupply, saleToListRatio, pctSoldAboveList, inventoryYoY } = input;

  const subScores: Array<{ score: number; weight: number }> = [];

  if (monthsSupply !== undefined) {
    const s = Math.max(0, Math.min(100, 100 - (monthsSupply - 1) * 18));
    subScores.push({ score: s, weight: 30 });
  }
  if (saleToListRatio !== undefined) {
    const s = Math.max(0, Math.min(100, 60 + (1 - (1 - saleToListRatio) * 50) * 0.4));
    subScores.push({ score: s, weight: 25 });
  }
  if (pctSoldAboveList !== undefined) {
    const s = Math.max(0, Math.min(100, pctSoldAboveList * 200));
    subScores.push({ score: s, weight: 20 });
  }
  if (inventoryYoY !== undefined) {
    const s = Math.max(0, Math.min(100, 70 - inventoryYoY * 100));
    subScores.push({ score: s, weight: 25 });
  }

  if (subScores.length < 3) return undefined;

  const totalWeight = subScores.reduce((sum, x) => sum + x.weight, 0);
  const weighted = subScores.reduce((sum, x) => sum + x.score * x.weight, 0);
  return Math.round(weighted / totalWeight);
}
