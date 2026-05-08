import { describe, it, expect } from 'vitest';
import { affordabilityIndex } from './affordability.js';

describe('affordabilityIndex', () => {
  it('returns a moderate ratio for a 600k home with 120k income', () => {
    const ratio = affordabilityIndex({
      medianSalePrice: 600_000,
      propertyTaxRate: 0.0095,
      medianHouseholdIncome: 120_000,
      mortgageRate: 0.0623,
    });
    expect(ratio).toBeDefined();
    expect(ratio!).toBeGreaterThan(0.3);
    expect(ratio!).toBeLessThan(0.45);
  });

  it('returns a low ratio for a 200k home with 120k income', () => {
    const ratio = affordabilityIndex({
      medianSalePrice: 200_000,
      propertyTaxRate: 0.0095,
      medianHouseholdIncome: 120_000,
      mortgageRate: 0.0623,
    });
    expect(ratio).toBeDefined();
    expect(ratio!).toBeLessThan(0.3);
  });

  it('returns undefined when medianSalePrice is missing', () => {
    expect(
      affordabilityIndex({ propertyTaxRate: 0.01, medianHouseholdIncome: 100_000, mortgageRate: 0.065 }),
    ).toBeUndefined();
  });

  it('returns undefined when propertyTaxRate is missing', () => {
    expect(
      affordabilityIndex({ medianSalePrice: 500_000, medianHouseholdIncome: 100_000, mortgageRate: 0.065 }),
    ).toBeUndefined();
  });

  it('returns undefined when medianHouseholdIncome is missing', () => {
    expect(
      affordabilityIndex({ medianSalePrice: 500_000, propertyTaxRate: 0.01, mortgageRate: 0.065 }),
    ).toBeUndefined();
  });
});
