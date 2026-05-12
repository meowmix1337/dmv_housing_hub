package transform

import (
	"sort"
	"strings"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

// SortAndDeduplicate mirrors the dedup pass in scripts/transform/build-county-pages.ts.
//
// For Redfin observations, rows whose series ends with `:all_residential` are
// sorted ahead of property-type-specific rows so the dedup below keeps the
// aggregate for non-breakdown metrics. Non-Redfin rows keep their relative
// order (stable sort).
//
// Dedupe key is (source, fips, metric, observedAt) for everything EXCEPT
// Redfin's `active_listings` metric, which additionally keys on series so the
// four property-type rows survive (consumed by BuildActiveListingsBreakdown).
//
// Returns a new slice; the input is left intact.
func SortAndDeduplicate(obs []types.Observation) ([]types.Observation, int) {
	// Make a copy we can sort without mutating caller's slice.
	cp := make([]types.Observation, len(obs))
	copy(cp, obs)

	// Stable sort: only reorder when BOTH are Redfin and one is all_residential.
	sort.SliceStable(cp, func(i, j int) bool {
		a, b := cp[i], cp[j]
		if a.Source != "redfin" || b.Source != "redfin" {
			return false
		}
		aIsAll := !strings.HasSuffix(a.Series, ":all_residential")
		bIsAll := !strings.HasSuffix(b.Series, ":all_residential")
		// false (= all_residential) sorts ahead of true.
		if aIsAll == bIsAll {
			return false
		}
		return !aIsAll && bIsAll
	})

	seen := make(map[string]struct{}, len(cp))
	out := make([]types.Observation, 0, len(cp))
	for _, o := range cp {
		var key string
		if o.Source == "redfin" && o.Metric == types.MetricActiveListings {
			key = o.Source + ":" + o.Series + ":" + o.FIPS + ":" + string(o.Metric) + ":" + o.ObservedAt
		} else {
			key = o.Source + ":" + o.FIPS + ":" + string(o.Metric) + ":" + o.ObservedAt
		}
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, o)
	}
	return out, len(cp) - len(out)
}
