// Package transform builds the per-county JSON files and DMV-level aggregates
// from the union of all ingest caches. Mirrors scripts/transform/build-county-pages.ts.
package transform

import (
	"fmt"
	"sort"
	"time"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

// CountyExtras carries per-county data that's not derived from observations
// (median household income override, population). PropertyTaxRate is no
// longer passed in here — it now comes from the in-package PropertyTaxRates
// static map, mirroring TS's lib/property-tax-rates.ts.
type CountyExtras struct {
	Population *float64
}

// BuildOptions controls the cross-cutting inputs to BuildCountyPages.
type BuildOptions struct {
	// MortgageRate is the latest 30y rate as a decimal (e.g. 0.063). When
	// nil, affordability index is skipped for every county.
	MortgageRate *float64
}

// BuildCountyPages returns one CountySummary per known DMV county. The
// observations slice is expected to have been deduplicated by the caller.
func BuildCountyPages(
	obs []types.Observation,
	cs []counties.County,
	extras map[string]CountyExtras,
	generatedAt time.Time,
	opts BuildOptions,
) ([]types.CountySummary, error) {
	lastUpdated := generatedAt.UTC().Format(asISOMillis)
	out := make([]types.CountySummary, 0, len(cs))
	for _, c := range cs {
		summary, err := buildOne(c, obs, extras[c.FIPS], lastUpdated, opts)
		if err != nil {
			return nil, fmt.Errorf("county %s: %w", c.FIPS, err)
		}
		out = append(out, summary)
	}
	return out, nil
}

const asISOMillis = "2006-01-02T15:04:05.000Z07:00"

func buildOne(c counties.County, obs []types.Observation, extra CountyExtras, lastUpdated string, opts BuildOptions) (types.CountySummary, error) {
	forCounty := filterByFIPS(obs, c.FIPS)

	fhfaHpi := toMetricPoints(filterByMetric(forCounty, types.MetricFhfaHpi))
	zhvi := toMetricPoints(filterBy(forCounty, types.MetricZhviAllHomes, ""))
	medianSale := toMetricPoints(filterBy(forCounty, types.MetricMedianSalePrice, ""))
	dom := toMetricPoints(filterBy(forCounty, types.MetricDaysOnMarket, ""))
	monthsSupply := toMetricPoints(filterBy(forCounty, types.MetricMonthsSupply, ""))
	unemployment := toMetricPoints(filterBy(forCounty, types.MetricUnemploymentRate, ""))
	saleToList := toMetricPoints(filterBy(forCounty, types.MetricSaleToListRatio, ""))
	pctAboveList := toMetricPoints(filterBy(forCounty, types.MetricPctSoldAboveList, ""))
	income := toMetricPoints(filterBy(forCounty, types.MetricMedianHouseholdInc, ""))
	fedQcew := toMetricPoints(filterBy(forCounty, types.MetricFederalEmployment, "qcew"))

	series := types.CountySeries{}
	if len(fhfaHpi) > 0 {
		series.FhfaHpi = fhfaHpi
	}
	if len(zhvi) > 0 {
		series.Zhvi = zhvi
	}
	if len(medianSale) > 0 {
		series.MedianSalePrice = medianSale
	}
	if len(dom) > 0 {
		series.DaysOnMarket = dom
	}
	if len(fedQcew) > 0 {
		series.FederalEmployment = fedQcew
	}

	activeListings := BuildActiveListingsBreakdown(forCounty)
	if activeListings != nil {
		series.ActiveListings = activeListings
	}

	// inventory YoY off the breakdown's `total` series
	var inventoryYoY *float64
	if activeListings != nil && len(activeListings.Total) > 0 {
		last := activeListings.Total[len(activeListings.Total)-1]
		if yearAgo, ok := findLastOnOrBefore(activeListings.Total, isoYearAgo(last.Date)); ok && yearAgo.Value > 0 {
			y := (last.Value - yearAgo.Value) / yearAgo.Value
			inventoryYoY = &y
		}
	}

	current := types.CountyCurrentSnapshot{}

	if len(zhvi) > 0 {
		latest := zhvi[len(zhvi)-1]
		v := latest.Value
		current.Zhvi = &v
		if y, ok := findLastOnOrBefore(zhvi, isoYearAgo(latest.Date)); ok {
			d := (latest.Value - y.Value) / y.Value
			current.ZhviYoY = &d
		}
	}
	if len(medianSale) > 0 {
		latest := medianSale[len(medianSale)-1]
		v := latest.Value
		current.MedianSalePrice = &v
		if y, ok := findLastOnOrBefore(medianSale, isoYearAgo(latest.Date)); ok {
			d := (latest.Value - y.Value) / y.Value
			current.MedianSalePriceYoY = &d
		}
	}
	if len(dom) > 0 {
		v := dom[len(dom)-1].Value
		current.DaysOnMarket = &v
	}
	if len(monthsSupply) > 0 {
		v := monthsSupply[len(monthsSupply)-1].Value
		current.MonthsSupply = &v
	}
	if len(unemployment) > 0 {
		v := unemployment[len(unemployment)-1].Value
		current.UnemploymentRate = &v
	}
	if len(saleToList) > 0 {
		v := saleToList[len(saleToList)-1].Value
		current.SaleToListRatio = &v
	}
	if len(pctAboveList) > 0 {
		v := pctAboveList[len(pctAboveList)-1].Value
		current.PctSoldAboveList = &v
	}

	summary := types.CountySummary{
		FIPS:         c.FIPS,
		Name:         c.Name,
		Jurisdiction: c.Jurisdiction,
		Population:   extra.Population,
		LastUpdated:  lastUpdated,
		Current:      current,
		Series:       series,
	}

	if len(income) > 0 {
		v := income[len(income)-1].Value
		summary.MedianHouseholdIncome = &v
	}

	if len(fedQcew) > 0 {
		latest := fedQcew[len(fedQcew)-1]
		v := latest.Value
		summary.Current.FederalEmployment = &v
		d := latest.Date
		summary.Current.FederalEmploymentAsOf = &d
		if y, ok := findLastOnOrBefore(fedQcew, isoYearAgo(latest.Date)); ok {
			delta := (latest.Value - y.Value) / y.Value
			summary.Current.FederalEmploymentYoY = &delta
		}
	}

	if rate, ok := PropertyTaxRates[c.FIPS]; ok {
		r := rate
		summary.PropertyTaxRate = &r
	}

	if activeListings != nil && len(activeListings.Total) > 0 {
		v := activeListings.Total[len(activeListings.Total)-1].Value
		summary.Current.ActiveListings = &v
		summary.Current.ActiveListingsYoY = inventoryYoY
	}

	mhs := MarketHealthScore(MarketHealthInput{
		MonthsSupply:     summary.Current.MonthsSupply,
		SaleToListRatio:  summary.Current.SaleToListRatio,
		PctSoldAboveList: summary.Current.PctSoldAboveList,
		InventoryYoY:     inventoryYoY,
	})
	if mhs != nil {
		summary.Current.MarketHealthScore = mhs
	}

	if opts.MortgageRate != nil {
		ai := AffordabilityIndex(AffordabilityInput{
			MedianSalePrice:       summary.Current.MedianSalePrice,
			MedianHouseholdIncome: summary.MedianHouseholdIncome,
			MortgageRate:          *opts.MortgageRate,
		})
		if ai != nil {
			summary.Current.AffordabilityIndex = ai
		}
	}

	return summary, nil
}

// ---- helpers ----

func filterByFIPS(obs []types.Observation, fips string) []types.Observation {
	out := make([]types.Observation, 0, 64)
	for _, o := range obs {
		if o.FIPS == fips {
			out = append(out, o)
		}
	}
	return out
}

func filterByMetric(obs []types.Observation, m types.MetricId) []types.Observation {
	out := make([]types.Observation, 0, 64)
	for _, o := range obs {
		if o.Metric == m {
			out = append(out, o)
		}
	}
	return out
}

// filterBy matches by metric and optionally by source. Empty source ignores source.
func filterBy(obs []types.Observation, m types.MetricId, source string) []types.Observation {
	out := make([]types.Observation, 0, 64)
	for _, o := range obs {
		if o.Metric != m {
			continue
		}
		if source != "" && o.Source != source {
			continue
		}
		out = append(out, o)
	}
	return out
}

func toMetricPoints(obs []types.Observation) []types.MetricPoint {
	pts := make([]types.MetricPoint, 0, len(obs))
	for _, o := range obs {
		pts = append(pts, types.MetricPoint{Date: o.ObservedAt, Value: o.Value})
	}
	sort.SliceStable(pts, func(i, j int) bool { return pts[i].Date < pts[j].Date })
	return pts
}

// findLastOnOrBefore returns the last point whose date is on or before `date`.
// Series is assumed sorted ascending by date (toMetricPoints does this).
// Mirrors TS's Array.prototype.findLast with the predicate (p) => p.date <= cutoff.
func findLastOnOrBefore(series []types.MetricPoint, date string) (types.MetricPoint, bool) {
	for i := len(series) - 1; i >= 0; i-- {
		if series[i].Date <= date {
			return series[i], true
		}
	}
	return types.MetricPoint{}, false
}

// isoYearAgo returns the date one year before `date` in ISO YYYY-MM-DD form.
// Matches TS's `new Date(date); setUTCFullYear(d.getUTCFullYear() - 1)`.
// For Feb 29 inputs, TS rolls forward to Mar 1 of the prior year; Go's
// time.AddDate does the same thing because both languages normalize.
func isoYearAgo(date string) string {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		// Try with full RFC3339 in case it's a longer form.
		t2, err2 := time.Parse(time.RFC3339, date)
		if err2 != nil {
			return date
		}
		t = t2
	}
	return t.AddDate(-1, 0, 0).Format("2006-01-02")
}
