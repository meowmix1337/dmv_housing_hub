package qcew

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

func TestQuarterToObservedAt(t *testing.T) {
	cases := []struct {
		year, qtr int
		want      string
	}{
		{2024, 1, "2024-03-01"},
		{2024, 2, "2024-06-01"},
		{2024, 3, "2024-09-01"},
		{2024, 4, "2024-12-01"},
	}
	for _, c := range cases {
		if got := QuarterToObservedAt(c.year, c.qtr); got != c.want {
			t.Errorf("QuarterToObservedAt(%d,%d)=%q want %q", c.year, c.qtr, got, c.want)
		}
	}
}

func TestParseCSVAndSelectFederalCountyTotal(t *testing.T) {
	body, err := os.ReadFile(filepath.Join("testdata", "qcew_sample.csv"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	rows, err := ParseCSV(string(body))
	if err != nil {
		t.Fatalf("ParseCSV: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("want 3 rows, got %d", len(rows))
	}
	r := SelectFederalCountyTotal(rows)
	if r == nil {
		t.Fatal("federal county total row not found")
	}
	if r.OwnCode != "1" || r.AgglvlCode != "71" || r.IndustryCode != "10" {
		t.Errorf("wrong row selected: %+v", r)
	}
	if r.Month3Emplvl != "193102" {
		t.Errorf("Month3Emplvl=%q want 193102", r.Month3Emplvl)
	}
}

func TestRowToObservationHappyPath(t *testing.T) {
	r := Row{
		AreaFIPS: "11001", OwnCode: "1", IndustryCode: "10", AgglvlCode: "71",
		Year: "2024", Qtr: "1", DisclosureCode: "", Month3Emplvl: "193102",
	}
	obs := RowToObservation(r, "11001", nil)
	if obs == nil {
		t.Fatal("nil observation")
	}
	want := types.Observation{
		Source:     "qcew",
		Series:     "qcew:11001:2024Q1:own1:naics10",
		FIPS:       "11001",
		Metric:     types.MetricFederalEmployment,
		ObservedAt: "2024-03-01",
		Value:      193102,
		Unit:       types.UnitCount,
	}
	if *obs != want {
		t.Errorf("got %+v want %+v", *obs, want)
	}
}

func TestRowToObservationSuppressed(t *testing.T) {
	r := Row{
		AreaFIPS: "11001", OwnCode: "1", IndustryCode: "10", AgglvlCode: "71",
		Year: "2024", Qtr: "1", DisclosureCode: "N", Month3Emplvl: "0",
	}
	if obs := RowToObservation(r, "11001", nil); obs != nil {
		t.Errorf("want nil for suppressed row, got %+v", obs)
	}
}

func TestRowToObservationNonNumeric(t *testing.T) {
	r := Row{
		AreaFIPS: "11001", OwnCode: "1", IndustryCode: "10", AgglvlCode: "71",
		Year: "2024", Qtr: "1", DisclosureCode: "", Month3Emplvl: "n/a",
	}
	if obs := RowToObservation(r, "11001", nil); obs != nil {
		t.Errorf("want nil for non-numeric, got %+v", obs)
	}
}
