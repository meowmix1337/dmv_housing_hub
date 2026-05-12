package transform

import (
	"sort"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

// BuildFederalEmploymentDmv sums per-county QCEW federal_employment across
// all DMV counties. Only quarters with full DMV coverage are emitted.
// Returns nil if no fully-covered quarter exists.
func BuildFederalEmploymentDmv(obs []types.Observation, cs []counties.County, lastUpdated string) *types.FederalEmploymentDmv {
	dmvSet := map[string]struct{}{}
	for _, c := range cs {
		dmvSet[c.FIPS] = struct{}{}
	}

	byDate := map[string]float64{}
	countByDate := map[string]int{}
	contributing := map[string]struct{}{}
	for _, o := range obs {
		if o.Metric != types.MetricFederalEmployment || o.Source != "qcew" {
			continue
		}
		if _, in := dmvSet[o.FIPS]; !in {
			continue
		}
		contributing[o.FIPS] = struct{}{}
		byDate[o.ObservedAt] += o.Value
		countByDate[o.ObservedAt]++
	}
	if len(byDate) == 0 {
		return nil
	}

	full := make([]types.MetricPoint, 0, len(byDate))
	for d, n := range countByDate {
		if n == len(cs) {
			full = append(full, types.MetricPoint{Date: d, Value: byDate[d]})
		}
	}
	if len(full) == 0 {
		return nil
	}
	sort.SliceStable(full, func(i, j int) bool { return full[i].Date < full[j].Date })

	latest := full[len(full)-1]
	var yoy *float64
	if y, ok := findLastOnOrBefore(full, isoYearAgo(latest.Date)); ok {
		d := (latest.Value - y.Value) / y.Value
		yoy = &d
	}

	contributingFips := make([]string, 0, len(contributing))
	for f := range contributing {
		contributingFips = append(contributingFips, f)
	}
	sort.Strings(contributingFips)

	missing := []string{}
	for _, c := range cs {
		if _, in := contributing[c.FIPS]; !in {
			missing = append(missing, c.FIPS)
		}
	}
	sort.Strings(missing)

	return &types.FederalEmploymentDmv{
		Metric:           "federal_employment",
		FIPS:             "DMV",
		Unit:             "count",
		Cadence:          "quarterly",
		Source:           "qcew",
		LastUpdated:      lastUpdated,
		Aggregation:      "in-repo county sum",
		ContributingFips: contributingFips,
		Coverage:         types.DmvCoverage{FIPS: contributingFips, Missing: missing},
		Total:            latest.Value,
		TotalYoY:         yoy,
		AsOf:             latest.Date,
		Points:           full,
	}
}

// BuildActiveListingsDmv aggregates per-county active-listings breakdowns into
// a DMV-wide series. Counties with sparse breakdowns (<95% of max length) are
// excluded; among the remaining "covered" set, a month is emitted only when
// every covered county reports for it.
func BuildActiveListingsDmv(obs []types.Observation, cs []counties.County, lastUpdated string) *types.ActiveListingsDmv {
	const coverageRatio = 0.95

	// Per-county raw breakdowns.
	perCounty := map[string]*types.ActiveListingsBreakdown{}
	for _, c := range cs {
		forCounty := filterByFIPS(obs, c.FIPS)
		if b := BuildActiveListingsBreakdown(forCounty); b != nil {
			perCounty[c.FIPS] = b
		}
	}
	if len(perCounty) == 0 {
		return nil
	}

	// Max series length for the coverage threshold.
	maxLen := 0
	for _, b := range perCounty {
		if l := len(b.Total); l > maxLen {
			maxLen = l
		}
	}

	// Keep only counties whose series is >= 95% of maxLen.
	thresh := float64(maxLen) * coverageRatio
	covered := map[string]*types.ActiveListingsBreakdown{}
	for f, b := range perCounty {
		if float64(len(b.Total)) >= thresh {
			covered[f] = b
		}
	}
	if len(covered) == 0 {
		return nil
	}

	coveredKeys := make([]string, 0, len(covered))
	for k := range covered {
		coveredKeys = append(coveredKeys, k)
	}
	sort.Strings(coveredKeys)

	// Match TS ordering: missing follows the DMV_COUNTIES iteration order (no sort).
	missing := []string{}
	for _, c := range cs {
		if _, in := covered[c.FIPS]; !in {
			missing = append(missing, c.FIPS)
		}
	}

	// Date counts across covered counties' total series.
	dateCount := map[string]int{}
	for _, b := range covered {
		for _, p := range b.Total {
			dateCount[p.Date]++
		}
	}
	fullDates := make([]string, 0, len(dateCount))
	for d, n := range dateCount {
		if n == len(coveredKeys) {
			fullDates = append(fullDates, d)
		}
	}
	sort.Strings(fullDates)
	if len(fullDates) == 0 {
		return nil
	}

	// Build per-date sums by looking up each date in each covered breakdown.
	// To make lookups O(1), pre-index by date.
	type indexedBreakdown struct {
		total    map[string]float64
		sf, cd, th, mf map[string]float64
	}
	indexed := map[string]indexedBreakdown{}
	for f, b := range covered {
		ib := indexedBreakdown{
			total: map[string]float64{},
			sf:    map[string]float64{},
			cd:    map[string]float64{},
			th:    map[string]float64{},
			mf:    map[string]float64{},
		}
		for _, p := range b.Total {
			ib.total[p.Date] = p.Value
		}
		for _, p := range b.ByType.SingleFamily {
			ib.sf[p.Date] = p.Value
		}
		for _, p := range b.ByType.Condo {
			ib.cd[p.Date] = p.Value
		}
		for _, p := range b.ByType.Townhouse {
			ib.th[p.Date] = p.Value
		}
		for _, p := range b.ByType.MultiFamily {
			ib.mf[p.Date] = p.Value
		}
		indexed[f] = ib
	}

	seriesTotal := make([]types.MetricPoint, 0, len(fullDates))
	byType := types.ActiveListingsByType{
		SingleFamily: make([]types.MetricPoint, 0, len(fullDates)),
		Condo:        make([]types.MetricPoint, 0, len(fullDates)),
		Townhouse:    make([]types.MetricPoint, 0, len(fullDates)),
		MultiFamily:  make([]types.MetricPoint, 0, len(fullDates)),
	}
	for _, d := range fullDates {
		var sum, sf, cd, th, mf float64
		for _, f := range coveredKeys {
			ib := indexed[f]
			sum += ib.total[d]
			sf += ib.sf[d]
			cd += ib.cd[d]
			th += ib.th[d]
			mf += ib.mf[d]
		}
		seriesTotal = append(seriesTotal, types.MetricPoint{Date: d, Value: sum})
		byType.SingleFamily = append(byType.SingleFamily, types.MetricPoint{Date: d, Value: sf})
		byType.Condo = append(byType.Condo, types.MetricPoint{Date: d, Value: cd})
		byType.Townhouse = append(byType.Townhouse, types.MetricPoint{Date: d, Value: th})
		byType.MultiFamily = append(byType.MultiFamily, types.MetricPoint{Date: d, Value: mf})
	}

	last := seriesTotal[len(seriesTotal)-1]
	var yoy *float64
	if y, ok := findLastOnOrBefore(seriesTotal, isoYearAgo(last.Date)); ok && y.Value > 0 {
		d := (last.Value - y.Value) / y.Value
		yoy = &d
	}

	return &types.ActiveListingsDmv{
		Metric:           "active_listings",
		FIPS:             "DMV",
		Unit:             "count",
		Cadence:          "monthly",
		Source:           "redfin",
		LastUpdated:      lastUpdated,
		Aggregation:      "in-repo county sum",
		ContributingFips: coveredKeys,
		AsOf:             last.Date,
		Latest: types.ActiveListingsDmvLatest{
			Total: last.Value,
			ByType: types.ActiveListingsDmvLatestByType{
				SingleFamily: byType.SingleFamily[len(byType.SingleFamily)-1].Value,
				Condo:        byType.Condo[len(byType.Condo)-1].Value,
				Townhouse:    byType.Townhouse[len(byType.Townhouse)-1].Value,
				MultiFamily:  byType.MultiFamily[len(byType.MultiFamily)-1].Value,
			},
		},
		LatestYoY: yoy,
		Series:    types.ActiveListingsBreakdown{Total: seriesTotal, ByType: byType},
		Coverage:  types.DmvCoverage{FIPS: coveredKeys, Missing: missing},
	}
}
