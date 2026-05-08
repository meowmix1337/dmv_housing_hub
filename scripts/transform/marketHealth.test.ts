import { describe, it, expect } from 'vitest';
import { marketHealthScore } from './marketHealth.js';

describe('marketHealthScore', () => {
  it('returns high score for a healthy market', () => {
    const score = marketHealthScore({
      monthsSupply: 1.0,
      saleToListRatio: 1.02,
      pctSoldAboveList: 0.6,
      inventoryYoY: -0.2,
    });
    expect(score).toBeDefined();
    expect(score!).toBeGreaterThan(75);
  });

  it('returns low score for a soft market', () => {
    const score = marketHealthScore({
      monthsSupply: 6.0,
      saleToListRatio: 0.96,
      pctSoldAboveList: 0.05,
      inventoryYoY: 0.5,
    });
    expect(score).toBeDefined();
    expect(score!).toBeLessThan(35);
  });

  it('returns undefined when fewer than 3 inputs are present', () => {
    expect(marketHealthScore({ monthsSupply: 2.0, saleToListRatio: 1.0 })).toBeUndefined();
    expect(marketHealthScore({})).toBeUndefined();
    expect(marketHealthScore({ monthsSupply: 2.0 })).toBeUndefined();
  });

  it('computes with exactly 3 inputs', () => {
    const score = marketHealthScore({
      monthsSupply: 2.0,
      saleToListRatio: 1.0,
      pctSoldAboveList: 0.3,
    });
    expect(score).toBeDefined();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(100);
  });
});
