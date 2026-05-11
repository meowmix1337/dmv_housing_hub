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
// (property tax rate, population). The transform host populates these before
// calling BuildCountyPages.
type CountyExtras struct {
	Population      *float64
	PropertyTaxRate *float64
}

// BuildCountyPages returns one CountySummary per known DMV county. Observations
// not matching any county FIPS are silently dropped. This is the FRED-only
// version for Slice 2; later slices extend it to populate all CountySummary
// fields.
func BuildCountyPages(
	obs []types.Observation,
	cs []counties.County,
	extras map[string]CountyExtras,
	generatedAt time.Time,
) ([]types.CountySummary, error) {
	out := make([]types.CountySummary, 0, len(cs))
	for _, c := range cs {
		summary, err := buildOne(c, obs, extras[c.FIPS], generatedAt)
		if err != nil {
			return nil, fmt.Errorf("county %s: %w", c.FIPS, err)
		}
		out = append(out, summary)
	}
	return out, nil
}

func buildOne(c counties.County, obs []types.Observation, extra CountyExtras, generatedAt time.Time) (types.CountySummary, error) {
	forCounty := filterByFIPS(obs, c.FIPS)

	series := types.CountySeries{}
	if pts := toMetricPoints(filterByMetric(forCounty, types.MetricFhfaHpi)); len(pts) > 0 {
		series.FhfaHpi = pts
	}

	return types.CountySummary{
		FIPS:            c.FIPS,
		Name:            c.Name,
		Jurisdiction:    c.Jurisdiction,
		Population:      extra.Population,
		PropertyTaxRate: extra.PropertyTaxRate,
		LastUpdated:     generatedAt.UTC().Format(time.RFC3339),
		Current:         types.CountyCurrentSnapshot{},
		Series:          series,
	}, nil
}

func filterByFIPS(obs []types.Observation, fips string) []types.Observation {
	out := make([]types.Observation, 0)
	for _, o := range obs {
		if o.FIPS == fips {
			out = append(out, o)
		}
	}
	return out
}

func filterByMetric(obs []types.Observation, m types.MetricId) []types.Observation {
	out := make([]types.Observation, 0)
	for _, o := range obs {
		if o.Metric == m {
			out = append(out, o)
		}
	}
	return out
}

// toMetricPoints converts observations to date-sorted MetricPoints. Mirrors
// scripts/transform/build-county-pages.ts toMetricPoints.
func toMetricPoints(obs []types.Observation) []types.MetricPoint {
	pts := make([]types.MetricPoint, 0, len(obs))
	for _, o := range obs {
		pts = append(pts, types.MetricPoint{Date: o.ObservedAt, Value: o.Value})
	}
	sort.Slice(pts, func(i, j int) bool { return pts[i].Date < pts[j].Date })
	return pts
}
