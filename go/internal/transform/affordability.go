package transform

import "math"

// AffordabilityInput is the per-county input to NAR HAI.
type AffordabilityInput struct {
	MedianSalePrice        *float64
	MedianHouseholdIncome  *float64
	// MortgageRate is the latest weekly Freddie Mac PMMS rate as a decimal
	// (e.g., 0.0623 for 6.23%).
	MortgageRate float64
}

// AffordabilityIndex returns the NAR-style Housing Affordability Index:
//
//	HAI = (median household income / qualifying income) × 100
//
// Qualifying income = monthlyPI × 4 × 12, where monthlyPI is the P&I
// payment on a 30-year fixed mortgage at the latest PMMS rate covering 80%
// of the median sale price. The ×4 reverses NAR's 25% qualifying ratio.
// Returns nil when any input is missing or the rate is non-positive.
//
// Mirrors scripts/transform/affordability.ts exactly.
func AffordabilityIndex(in AffordabilityInput) *float64 {
	if in.MedianSalePrice == nil || in.MedianHouseholdIncome == nil {
		return nil
	}
	if in.MortgageRate <= 0 || math.IsInf(in.MortgageRate, 0) || math.IsNaN(in.MortgageRate) {
		return nil
	}
	principal := *in.MedianSalePrice * 0.8
	r := in.MortgageRate / 12
	const n = 360
	// Use Exp(n*Log(x)) instead of Pow(x, n) to match V8's `Math.pow` algorithm,
	// which always goes through fdlibm's log/exp path (Go's math.Pow takes a
	// fast integer-exponent path for integer y and diverges in the last ULP).
	pow := math.Exp(n * math.Log(1+r))
	monthlyPI := (principal * (r * pow)) / (pow - 1)
	qualifyingIncome := monthlyPI * 4 * 12
	if qualifyingIncome <= 0 {
		return nil
	}
	hai := (*in.MedianHouseholdIncome / qualifyingIncome) * 100
	return &hai
}
