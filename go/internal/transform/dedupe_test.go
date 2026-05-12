package transform

import (
	"testing"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

func TestSortAndDeduplicateRedfinAllResidentialWins(t *testing.T) {
	obs := []types.Observation{
		// Property-type rows for the same (fips, metric, date). All-residential should win.
		{Source: "redfin", Series: "redfin:county:condo", FIPS: "11001", Metric: types.MetricMedianSalePrice, ObservedAt: "2024-01-31", Value: 400},
		{Source: "redfin", Series: "redfin:county:single_family", FIPS: "11001", Metric: types.MetricMedianSalePrice, ObservedAt: "2024-01-31", Value: 700},
		{Source: "redfin", Series: "redfin:county:all_residential", FIPS: "11001", Metric: types.MetricMedianSalePrice, ObservedAt: "2024-01-31", Value: 600},
	}
	out, dropped := SortAndDeduplicate(obs)
	if len(out) != 1 {
		t.Fatalf("expected 1 row after dedup, got %d", len(out))
	}
	if dropped != 2 {
		t.Errorf("expected dropped=2, got %d", dropped)
	}
	if out[0].Series != "redfin:county:all_residential" {
		t.Errorf("expected all_residential winner, got %q (value=%v)", out[0].Series, out[0].Value)
	}
}

func TestSortAndDeduplicateActiveListingsKeepsPropertyTypes(t *testing.T) {
	// active_listings is keyed on series; all four breakdown rows must survive.
	obs := []types.Observation{
		{Source: "redfin", Series: "redfin:county:single_family", FIPS: "11001", Metric: types.MetricActiveListings, ObservedAt: "2024-01-31", Value: 100},
		{Source: "redfin", Series: "redfin:county:condo", FIPS: "11001", Metric: types.MetricActiveListings, ObservedAt: "2024-01-31", Value: 50},
		{Source: "redfin", Series: "redfin:county:townhouse", FIPS: "11001", Metric: types.MetricActiveListings, ObservedAt: "2024-01-31", Value: 30},
		{Source: "redfin", Series: "redfin:county:multi_family", FIPS: "11001", Metric: types.MetricActiveListings, ObservedAt: "2024-01-31", Value: 10},
	}
	out, dropped := SortAndDeduplicate(obs)
	if len(out) != 4 {
		t.Fatalf("want 4 active_listings rows after dedup, got %d", len(out))
	}
	if dropped != 0 {
		t.Errorf("want 0 dropped, got %d", dropped)
	}
}

func TestSortAndDeduplicateNonRedfinUntouched(t *testing.T) {
	obs := []types.Observation{
		{Source: "fred", Series: "MORTGAGE30US", FIPS: "USA", Metric: types.MetricMortgage30yRate, ObservedAt: "2024-01-05", Value: 6.0},
		{Source: "fred", Series: "MORTGAGE30US", FIPS: "USA", Metric: types.MetricMortgage30yRate, ObservedAt: "2024-01-05", Value: 6.0},
	}
	out, dropped := SortAndDeduplicate(obs)
	if len(out) != 1 {
		t.Errorf("non-Redfin dup not collapsed: %d rows out", len(out))
	}
	if dropped != 1 {
		t.Errorf("want 1 dropped, got %d", dropped)
	}
}
