interface AffordabilityInput {
  medianSalePrice?: number;
  propertyTaxRate?: number;
  medianHouseholdIncome?: number;
  mortgageRate: number; // decimal, e.g. 0.0623
}

export function affordabilityIndex(input: AffordabilityInput): number | undefined {
  const { medianSalePrice, propertyTaxRate, medianHouseholdIncome, mortgageRate } = input;
  if (
    medianSalePrice === undefined ||
    propertyTaxRate === undefined ||
    medianHouseholdIncome === undefined
  ) {
    return undefined;
  }

  const principal = medianSalePrice * 0.8; // 80% LTV
  const r = mortgageRate / 12;
  const n = 360;
  const piMonthly = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const taxMonthly = (medianSalePrice * propertyTaxRate) / 12;
  const insMonthly = (medianSalePrice * 0.0035) / 12;
  const piti = piMonthly + taxMonthly + insMonthly;

  return piti / (medianHouseholdIncome / 12);
}
