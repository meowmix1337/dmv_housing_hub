export interface AffordabilityInputs {
  medianSalePrice: number;
  propertyTaxRate: number;
  medianHouseholdIncome: number;
  mortgageRate: number; // decimal
  downPaymentPct?: number; // decimal, default 0.20
}

export interface AffordabilityResult {
  monthlyPayment: number;
  incomeRatio: number;
  piMonthly: number;
  taxMonthly: number;
  insMonthly: number;
}

export function calcAffordability(inputs: AffordabilityInputs): AffordabilityResult {
  const {
    medianSalePrice,
    propertyTaxRate,
    medianHouseholdIncome,
    mortgageRate,
    downPaymentPct = 0.20,
  } = inputs;

  const ltv = 1 - downPaymentPct;
  const principal = medianSalePrice * ltv;
  const r = mortgageRate / 12;
  const n = 360;
  const piMonthly = r === 0
    ? principal / n
    : principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const taxMonthly = (medianSalePrice * propertyTaxRate) / 12;
  const insMonthly = (medianSalePrice * 0.0035) / 12;
  const monthlyPayment = piMonthly + taxMonthly + insMonthly;
  const incomeRatio = monthlyPayment / (medianHouseholdIncome / 12);

  return { monthlyPayment, incomeRatio, piMonthly, taxMonthly, insMonthly };
}
