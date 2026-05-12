package transform

import (
	"math"
	"testing"
)

func TestAffordabilityIndexMatchesNARFormula(t *testing.T) {
	price := 500_000.0
	income := 100_000.0
	rate := 0.0623

	got := AffordabilityIndex(AffordabilityInput{
		MedianSalePrice:       &price,
		MedianHouseholdIncome: &income,
		MortgageRate:          rate,
	})
	if got == nil {
		t.Fatal("nil")
	}

	// Spot-check via the closed form on a calculator:
	// principal = 400000; r = 0.0623/12 = 0.005191666...
	// (1+r)^360 ≈ 6.4609...; monthlyPI ≈ 2461.97; qualifying ≈ 118174.4
	// HAI ≈ 100000 / 118174 * 100 ≈ 84.6
	if *got < 84.0 || *got > 85.0 {
		t.Errorf("HAI out of expected band [84,85]: got %v", *got)
	}
}

func TestAffordabilityIndexNilWhenMissingInputs(t *testing.T) {
	rate := 0.06
	p := 500000.0
	tests := []AffordabilityInput{
		{MortgageRate: rate},
		{MedianSalePrice: &p, MortgageRate: rate},
		{MedianSalePrice: &p, MedianHouseholdIncome: &p, MortgageRate: 0},
		{MedianSalePrice: &p, MedianHouseholdIncome: &p, MortgageRate: math.Inf(1)},
	}
	for i, in := range tests {
		if got := AffordabilityIndex(in); got != nil {
			t.Errorf("case %d: want nil, got %v", i, *got)
		}
	}
}

func ptr(v float64) *float64 { return &v }

func TestMarketHealthScoreSubInputThreshold(t *testing.T) {
	// Two inputs → nil.
	if got := MarketHealthScore(MarketHealthInput{
		MonthsSupply:    ptr(2.0),
		SaleToListRatio: ptr(0.99),
	}); got != nil {
		t.Errorf("want nil with 2 sub-inputs, got %v", *got)
	}
	// Three inputs → present.
	if got := MarketHealthScore(MarketHealthInput{
		MonthsSupply:     ptr(2.0),
		SaleToListRatio:  ptr(0.99),
		PctSoldAboveList: ptr(0.30),
	}); got == nil {
		t.Error("want value with 3 sub-inputs, got nil")
	}
}

func TestMarketHealthScoreClampsRange(t *testing.T) {
	// Inputs at the extremes still produce a 0..100 result.
	score := MarketHealthScore(MarketHealthInput{
		MonthsSupply:     ptr(20.0), // → clamp to 0
		SaleToListRatio:  ptr(0.5),  // → low
		PctSoldAboveList: ptr(0.0),
		InventoryYoY:     ptr(1.0),
	})
	if score == nil {
		t.Fatal("nil")
	}
	if *score < 0 || *score > 100 {
		t.Errorf("score out of range: %v", *score)
	}
}
