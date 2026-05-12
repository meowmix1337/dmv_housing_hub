package transform

import "math"

type MarketHealthInput struct {
	MonthsSupply     *float64
	SaleToListRatio  *float64
	PctSoldAboveList *float64
	InventoryYoY     *float64
}

// MarketHealthScore returns a 0..100 composite score for one county.
// Returns nil if fewer than 3 sub-inputs are available.
// Mirrors scripts/transform/marketHealth.ts exactly, including the final
// Math.round() (banker's rounding equivalent in JS: standard round-half-away
// from zero; we use math.Round which is also half-away from zero).
func MarketHealthScore(in MarketHealthInput) *float64 {
	type sub struct{ score, weight float64 }
	var subs []sub

	clamp := func(x float64) float64 {
		if x < 0 {
			return 0
		}
		if x > 100 {
			return 100
		}
		return x
	}

	if in.MonthsSupply != nil {
		subs = append(subs, sub{score: clamp(100 - (*in.MonthsSupply-1)*18), weight: 30})
	}
	if in.SaleToListRatio != nil {
		s := clamp(60 + (1-(1-*in.SaleToListRatio)*50)*0.4)
		subs = append(subs, sub{score: s, weight: 25})
	}
	if in.PctSoldAboveList != nil {
		subs = append(subs, sub{score: clamp(*in.PctSoldAboveList * 200), weight: 20})
	}
	if in.InventoryYoY != nil {
		subs = append(subs, sub{score: clamp(70 - *in.InventoryYoY*100), weight: 25})
	}

	if len(subs) < 3 {
		return nil
	}
	var totalW, weighted float64
	for _, s := range subs {
		totalW += s.weight
		weighted += s.score * s.weight
	}
	out := math.Round(weighted / totalW)
	return &out
}
