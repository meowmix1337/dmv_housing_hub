package census

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

func loadFixture(t *testing.T, name string) [][]string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var rows [][]string
	if err := json.Unmarshal(data, &rows); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	return rows
}

func TestParseRowsDC(t *testing.T) {
	rows := loadFixture(t, "acs5_state_11.json")
	dmv := map[string]struct{}{"11001": {}}

	obs, err := ParseRows(rows, dmv, nil)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(obs) != 3 {
		t.Fatalf("want 3 observations, got %d", len(obs))
	}

	want := map[string]struct {
		value float64
		moe   float64
		unit  types.Unit
	}{
		"B19013_001E": {value: 109870, moe: 1937, unit: types.UnitUSD},
		"B25077_001E": {value: 737100, moe: 10625, unit: types.UnitUSD},
		"B25064_001E": {value: 1954, moe: 26, unit: types.UnitUSD},
	}

	for _, o := range obs {
		if o.Source != "census" {
			t.Errorf("source: got %q want census", o.Source)
		}
		if o.FIPS != "11001" {
			t.Errorf("fips: got %q want 11001", o.FIPS)
		}
		if o.ObservedAt != "2024-01-01" {
			t.Errorf("observedAt: got %q want 2024-01-01", o.ObservedAt)
		}
		w, ok := want[o.Series]
		if !ok {
			t.Errorf("unexpected series %q", o.Series)
			continue
		}
		if o.Value != w.value {
			t.Errorf("%s value: got %v want %v", o.Series, o.Value, w.value)
		}
		if o.Unit != w.unit {
			t.Errorf("%s unit: got %q want %q", o.Series, o.Unit, w.unit)
		}
		if o.MOE == nil || *o.MOE != w.moe {
			t.Errorf("%s moe: got %v want %v", o.Series, o.MOE, w.moe)
		}
	}
}

func TestParseRowsFiltersAndHandlesSentinel(t *testing.T) {
	rows := loadFixture(t, "acs5_state_24_sentinel.json")
	dmv := map[string]struct{}{"24003": {}, "24027": {}}

	obs, err := ParseRows(rows, dmv, nil)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}

	// 24999 is filtered out by DMV set.
	// 24003 has B19013 sentinel — that observation skipped, other two emitted.
	// 24027 contributes 3 observations.
	if got := len(obs); got != 5 {
		t.Fatalf("want 5 observations, got %d", got)
	}

	byFipsSeries := map[string]types.Observation{}
	for _, o := range obs {
		byFipsSeries[o.FIPS+":"+o.Series] = o
	}
	if _, ok := byFipsSeries["24003:B19013_001E"]; ok {
		t.Error("sentinel value not skipped for 24003 B19013")
	}
	if v := byFipsSeries["24003:B25077_001E"].Value; v != 420000 {
		t.Errorf("24003 B25077: got %v want 420000", v)
	}
	if v := byFipsSeries["24027:B19013_001E"].Value; v != 145000 {
		t.Errorf("24027 B19013: got %v want 145000", v)
	}
}

func TestFetchAgainstFakeServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		stateFilter := r.URL.Query().Get("in")
		var fixture string
		switch stateFilter {
		case "state:11":
			fixture = "acs5_state_11.json"
		case "state:24":
			fixture = "acs5_state_24_sentinel.json"
		case "state:51":
			fixture = "acs5_state_11.json" // reuse; the source filters by FIPS so VA will produce 0
		default:
			http.Error(w, "unknown state", http.StatusBadRequest)
			return
		}
		data, err := os.ReadFile(filepath.Join("testdata", fixture))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(data)
	}))
	defer srv.Close()

	src := New(Config{APIKey: "test"}, httpclient.New(httpclient.Options{Timeout: 5 * time.Second}))
	src.baseURL = srv.URL

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	obs, err := src.Fetch(ctx)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(obs) == 0 {
		t.Fatal("expected observations from fake server, got 0")
	}
}
