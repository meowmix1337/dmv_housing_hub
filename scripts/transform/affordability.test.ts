import { describe, it, expect } from 'vitest';
import { affordabilityIndex } from './affordability.js';

describe('affordabilityIndex (NAR HAI)', () => {
  it('returns ~100 when household income exactly matches qualifying income', () => {
    // Construct an input where medianHouseholdIncome equals qualifyingIncome.
    // Use the formula in reverse: qualifyingIncome = monthlyPI × 4 × 12.
    const medianSalePrice = 500_000;
    const mortgageRate = 0.0625;
    const principal = medianSalePrice * 0.8;
    const r = mortgageRate / 12;
    const n = 360;
    const monthlyPI = (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
    const qualifyingIncome = monthlyPI * 4 * 12;

    const hai = affordabilityIndex({
      medianSalePrice,
      medianHouseholdIncome: qualifyingIncome,
      mortgageRate,
    });
    expect(hai).toBeDefined();
    expect(hai!).toBeCloseTo(100, 6);
  });

  it('returns < 100 (shortfall) when income is below qualifying threshold', () => {
    const hai = affordabilityIndex({
      medianSalePrice: 800_000,
      medianHouseholdIncome: 120_000,
      mortgageRate: 0.065,
    });
    expect(hai).toBeDefined();
    expect(hai!).toBeLessThan(100);
  });

  it('returns > 100 (surplus) when income comfortably qualifies', () => {
    const hai = affordabilityIndex({
      medianSalePrice: 250_000,
      medianHouseholdIncome: 120_000,
      mortgageRate: 0.065,
    });
    expect(hai).toBeDefined();
    expect(hai!).toBeGreaterThan(100);
  });

  it('returns undefined when medianSalePrice is missing', () => {
    expect(
      affordabilityIndex({ medianHouseholdIncome: 100_000, mortgageRate: 0.065 }),
    ).toBeUndefined();
  });

  it('returns undefined when medianHouseholdIncome is missing', () => {
    expect(
      affordabilityIndex({ medianSalePrice: 500_000, mortgageRate: 0.065 }),
    ).toBeUndefined();
  });

  it('returns undefined when mortgageRate is non-positive', () => {
    expect(
      affordabilityIndex({ medianSalePrice: 500_000, medianHouseholdIncome: 120_000, mortgageRate: 0 }),
    ).toBeUndefined();
  });
});
