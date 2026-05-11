package zillow

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

func TestBuildFipsIndex(t *testing.T) {
	idx := BuildFipsIndex()
	// Names from counties.go are lowercase-mixed; the index keys are all lowercase.
	if got := idx["district of columbia"]; got != "11001" {
		t.Errorf("DC: got %q want 11001", got)
	}
	if got := idx["alexandria city"]; got != "51510" {
		t.Errorf("alexandria city: got %q want 51510", got)
	}
	// City suffix stripped:
	if got := idx["alexandria"]; got != "51510" {
		t.Errorf("alexandria (suffix stripped): got %q want 51510", got)
	}
	// Apostrophe stripped: "Prince George's County" → "prince georges county"
	if got := idx["prince georges county"]; got != "24033" {
		t.Errorf("prince georges county: got %q want 24033", got)
	}
}

func loadFixture(t *testing.T, name string) string {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return string(body)
}

func TestParseCSVCountyScope(t *testing.T) {
	idx := BuildFipsIndex()
	body := loadFixture(t, "zhvi_county_sample.csv")
	spec := FileSpec{URL: "test", Metric: types.MetricZhviAllHomes, Unit: types.UnitUSD, Scope: ScopeCounty}
	obs, err := ParseCSV(body, spec, idx, nil)
	if err != nil {
		t.Fatalf("ParseCSV: %v", err)
	}

	// Expected emissions:
	//   DC 11001: 2 dates → 2 obs
	//   Howard 24027: 1 date populated, 1 empty → 1 obs
	//   Prince George's 24033: 2 dates → 2 obs
	//   Alexandria 51510: 2 dates → 2 obs
	//   Pittsburgh PA: filtered by StateName → 0
	if got, want := len(obs), 7; got != want {
		t.Fatalf("count: got %d want %d", got, want)
	}

	byFipsDate := map[string]types.Observation{}
	for _, o := range obs {
		byFipsDate[o.FIPS+":"+o.ObservedAt] = o
		if o.Source != "zillow" {
			t.Errorf("source: %q", o.Source)
		}
		if o.Series != "zillow:county:zhvi_all_homes" {
			t.Errorf("series: %q", o.Series)
		}
		if o.Metric != types.MetricZhviAllHomes {
			t.Errorf("metric: %q", o.Metric)
		}
		if o.Unit != types.UnitUSD {
			t.Errorf("unit: %q", o.Unit)
		}
	}
	if v := byFipsDate["11001:2024-01-31"].Value; v != 650000 {
		t.Errorf("DC Jan: got %v want 650000", v)
	}
	if _, ok := byFipsDate["24027:2024-02-29"]; ok {
		t.Errorf("Howard Feb should be absent (empty cell)")
	}
}

func TestParseCSVMetroScope(t *testing.T) {
	// Metro file is structurally the same except RegionType="msa" and only "Washington, DC" matches.
	body := `RegionID,SizeRank,RegionName,RegionType,StateName,2024-01-31
394913,1,"Washington, DC",msa,DC,640000
395999,5,"New York, NY",msa,NY,800000
`
	spec := FileSpec{URL: "test", Metric: types.MetricZhviAllHomes, Unit: types.UnitUSD, Scope: ScopeMetro}
	obs, err := ParseCSV(body, spec, BuildFipsIndex(), nil)
	if err != nil {
		t.Fatalf("ParseCSV: %v", err)
	}
	if len(obs) != 1 {
		t.Fatalf("metro: got %d obs want 1", len(obs))
	}
	if obs[0].FIPS != "47900" {
		t.Errorf("metro FIPS: got %q want 47900", obs[0].FIPS)
	}
	if obs[0].Series != "zillow:metro:zhvi_all_homes" {
		t.Errorf("metro series: %q", obs[0].Series)
	}
}

func TestFetchAgainstFakeServer(t *testing.T) {
	body := loadFixture(t, "zhvi_county_sample.csv")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/csv")
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	src := New(httpclient.New(httpclient.Options{Timeout: 5 * time.Second}))
	src.SetFiles([]FileSpec{{URL: srv.URL, Metric: types.MetricZhviAllHomes, Unit: types.UnitUSD, Scope: ScopeCounty}})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	obs, err := src.Fetch(ctx)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(obs) != 7 {
		t.Fatalf("want 7 from fake server, got %d", len(obs))
	}
}
