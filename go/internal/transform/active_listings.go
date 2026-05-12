package transform

import (
	"sort"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

// propertyTypes is the slug-ordered set of Redfin breakdown types.
var propertyTypes = []string{"single_family", "condo", "townhouse", "multi_family"}

// requiredTypes gate emission of a date: SFR/condo/townhouse must be present.
// Multi-family is intermittent (rural counties) and defaults to 0 when absent.
// Mirrors scripts/transform/build-county-pages.ts REQUIRED_TYPES.
var requiredTypes = []string{"single_family", "condo", "townhouse"}

// BuildActiveListingsBreakdown produces a per-property-type active-listings
// breakdown for one county from its full observation list. Returns nil when
// no date has all required property types.
func BuildActiveListingsBreakdown(forCounty []types.Observation) *types.ActiveListingsBreakdown {
	// values[property][date] = count
	values := map[string]map[string]float64{
		"single_family": {},
		"condo":         {},
		"townhouse":     {},
		"multi_family":  {},
	}
	for _, t := range propertyTypes {
		seriesID := "redfin:county:" + t
		for _, o := range forCounty {
			if o.Metric == types.MetricActiveListings && o.Series == seriesID {
				values[t][o.ObservedAt] = o.Value
			}
		}
	}

	dateSet := map[string]struct{}{}
	for _, t := range propertyTypes {
		for d := range values[t] {
			dateSet[d] = struct{}{}
		}
	}
	allDates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		allDates = append(allDates, d)
	}
	sort.Strings(allDates)

	fullDates := allDates[:0]
	for _, d := range allDates {
		ok := true
		for _, rt := range requiredTypes {
			if _, present := values[rt][d]; !present {
				ok = false
				break
			}
		}
		if ok {
			fullDates = append(fullDates, d)
		}
	}
	if len(fullDates) == 0 {
		return nil
	}

	total := make([]types.MetricPoint, 0, len(fullDates))
	byType := types.ActiveListingsByType{
		SingleFamily: make([]types.MetricPoint, 0, len(fullDates)),
		Condo:        make([]types.MetricPoint, 0, len(fullDates)),
		Townhouse:    make([]types.MetricPoint, 0, len(fullDates)),
		MultiFamily:  make([]types.MetricPoint, 0, len(fullDates)),
	}
	for _, d := range fullDates {
		sf := values["single_family"][d]
		cd := values["condo"][d]
		th := values["townhouse"][d]
		mf := values["multi_family"][d]
		byType.SingleFamily = append(byType.SingleFamily, types.MetricPoint{Date: d, Value: sf})
		byType.Condo = append(byType.Condo, types.MetricPoint{Date: d, Value: cd})
		byType.Townhouse = append(byType.Townhouse, types.MetricPoint{Date: d, Value: th})
		byType.MultiFamily = append(byType.MultiFamily, types.MetricPoint{Date: d, Value: mf})
		total = append(total, types.MetricPoint{Date: d, Value: sf + cd + th + mf})
	}

	return &types.ActiveListingsBreakdown{Total: total, ByType: byType}
}
