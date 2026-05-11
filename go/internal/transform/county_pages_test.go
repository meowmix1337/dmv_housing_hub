package transform

import (
	"testing"
	"time"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

func TestBuildCountyPagesFREDOnly(t *testing.T) {
	now := time.Date(2026, 5, 10, 12, 0, 0, 0, time.UTC)
	obs := []types.Observation{
		{Source: "fred", Series: "ATNHPIUS11001A", FIPS: "11001", Metric: types.MetricFhfaHpi, ObservedAt: "2020-01-01", Value: 100.0, Unit: types.UnitIndexOther},
		{Source: "fred", Series: "ATNHPIUS11001A", FIPS: "11001", Metric: types.MetricFhfaHpi, ObservedAt: "2021-01-01", Value: 110.0, Unit: types.UnitIndexOther},
		{Source: "fred", Series: "ATNHPIUS11001A", FIPS: "11001", Metric: types.MetricFhfaHpi, ObservedAt: "2019-01-01", Value: 95.0, Unit: types.UnitIndexOther},
		// Observation for a county we DO know — gets included.
		{Source: "fred", Series: "ATNHPIUS24031A", FIPS: "24031", Metric: types.MetricFhfaHpi, ObservedAt: "2020-01-01", Value: 200.0, Unit: types.UnitIndexOther},
		// Observation for an unknown FIPS — silently dropped.
		{Source: "fred", Series: "X", FIPS: "99999", Metric: types.MetricFhfaHpi, ObservedAt: "2020-01-01", Value: 1.0, Unit: types.UnitIndexOther},
		// National series — also dropped (FIPS USA != any county).
		{Source: "fred", Series: "MORTGAGE30US", FIPS: "USA", Metric: types.MetricMortgage30yRate, ObservedAt: "2020-01-01", Value: 3.5, Unit: types.UnitPercent},
	}

	out, err := BuildCountyPages(obs, counties.All(), nil, now)
	if err != nil {
		t.Fatalf("BuildCountyPages: %v", err)
	}
	if got, want := len(out), 21; got != want {
		t.Fatalf("len: got %d, want %d", got, want)
	}

	// Find DC's summary.
	var dc *types.CountySummary
	for i := range out {
		if out[i].FIPS == "11001" {
			dc = &out[i]
			break
		}
	}
	if dc == nil {
		t.Fatal("DC summary missing")
	}
	if dc.Name != "District of Columbia" || dc.Jurisdiction != types.JurisdictionDC {
		t.Errorf("DC metadata wrong: %+v", dc)
	}
	if len(dc.Series.FhfaHpi) != 3 {
		t.Fatalf("DC fhfaHpi len: got %d, want 3", len(dc.Series.FhfaHpi))
	}
	// Series must be date-sorted ascending.
	want := []string{"2019-01-01", "2020-01-01", "2021-01-01"}
	for i, w := range want {
		if dc.Series.FhfaHpi[i].Date != w {
			t.Errorf("DC fhfaHpi[%d].Date = %q, want %q", i, dc.Series.FhfaHpi[i].Date, w)
		}
	}

	// A county with no observations should have empty (nil) fhfaHpi.
	var fairfaxCity *types.CountySummary
	for i := range out {
		if out[i].FIPS == "51600" {
			fairfaxCity = &out[i]
			break
		}
	}
	if fairfaxCity == nil {
		t.Fatal("Fairfax City summary missing")
	}
	if len(fairfaxCity.Series.FhfaHpi) != 0 {
		t.Errorf("Fairfax City fhfaHpi: got len %d, want 0", len(fairfaxCity.Series.FhfaHpi))
	}
}

func TestBuildManifestFREDOnly(t *testing.T) {
	now := time.Date(2026, 5, 10, 12, 0, 0, 0, time.UTC)
	m := BuildManifest([]SourceMeta{
		{Name: "fred", Cadence: types.CadenceMonthly, LastUpdated: "2026-05-10T12:00:00Z", Status: "ok"},
	}, now)
	if m.GeneratedAt == "" {
		t.Error("GeneratedAt missing")
	}
	if len(m.Sources) != 1 || m.Sources[0].Name != "fred" {
		t.Errorf("sources: %+v", m.Sources)
	}
}
