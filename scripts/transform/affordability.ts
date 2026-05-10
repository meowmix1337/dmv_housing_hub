interface AffordabilityInput {
  medianSalePrice?: number;
  medianHouseholdIncome?: number;
  /** Decimal, e.g. 0.0623 for 6.23%. Latest weekly Freddie Mac PMMS rate. */
  mortgageRate: number;
}

/**
 * Housing Affordability Index aligned with the NAR convention:
 *
 *   HAI = (median household income / qualifying income) × 100
 *
 * Qualifying income = monthlyPI × 4 × 12, where monthlyPI is the
 * principal-and-interest payment on a 30-year fixed mortgage at the
 * latest PMMS rate covering 80% of the median sale price. The "× 4"
 * reverses NAR's 25% qualifying ratio of P&I to gross monthly income.
 *
 * HAI = 100 means a household earning the median income has exactly
 * enough income to qualify; HAI > 100 means surplus; HAI < 100 means
 * shortfall.
 *
 * Note: NAR uses median *family* income; we substitute median *household*
 * income from ACS B19013 because that is the field already on every
 * county summary. Household income is typically lower than family
 * income, so this index reads slightly more conservative than NAR's
 * published series.
 */
export function affordabilityIndex(input: AffordabilityInput): number | undefined {
  const { medianSalePrice, medianHouseholdIncome, mortgageRate } = input;
  if (medianSalePrice === undefined || medianHouseholdIncome === undefined) {
    return undefined;
  }
  if (mortgageRate <= 0 || !Number.isFinite(mortgageRate)) return undefined;

  const principal = medianSalePrice * 0.8;
  const r = mortgageRate / 12;
  const n = 360;
  const monthlyPI = (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
  const qualifyingIncome = monthlyPI * 4 * 12;
  if (qualifyingIncome <= 0) return undefined;
  return (medianHouseholdIncome / qualifyingIncome) * 100;
}
