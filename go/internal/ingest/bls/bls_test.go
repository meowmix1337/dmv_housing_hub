package bls

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

func TestPeriodToISO(t *testing.T) {
	cases := []struct {
		year, period, want string
	}{
		{"2026", "M01", "2026-01-01"},
		{"2026", "M09", "2026-09-01"},
		{"2026", "M12", "2026-12-01"},
		{"2025", "M13", ""},
	}
	for _, c := range cases {
		got := PeriodToISO(c.year, c.period)
		if got != c.want {
			t.Errorf("PeriodToISO(%q,%q) = %q want %q", c.year, c.period, got, c.want)
		}
	}
}

func loadFixture(t *testing.T) apiResponse {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "bls_response.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var raw apiResponse
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	return raw
}

func TestParseResponseFixture(t *testing.T) {
	raw := loadFixture(t)
	meta := map[string]seriesMeta{
		"LAUCN110010000000003": {fips: "11001", metric: types.MetricUnemploymentRate, unit: types.UnitPercent},
		"SMU11479009091000001": {fips: msaFederalFIPS, metric: types.MetricFederalEmployment, unit: types.UnitCount},
	}
	obs, err := ParseResponse(raw, meta, nil)
	if err != nil {
		t.Fatalf("ParseResponse: %v", err)
	}
	// 2 LAUS M01-M12 + 1 MSA M01-M12, M13 dropped from both.
	// Fixture: LAUS has M03+M02+M12 (3 valid) + M13 (dropped) = 3; MSA has M03 (1 valid) + M13 (dropped) = 1.
	if got := len(obs); got != 4 {
		t.Fatalf("want 4 observations, got %d", got)
	}

	for _, o := range obs {
		if o.Source != "bls" {
			t.Errorf("source: %q", o.Source)
		}
		if o.ObservedAt == "" || len(o.ObservedAt) != len("2026-01-01") {
			t.Errorf("bad observedAt: %q", o.ObservedAt)
		}
	}

	// Verify the LAUS rows produced unemployment_rate with percent unit and fips=11001.
	gotLAUS := 0
	for _, o := range obs {
		if o.Series == "LAUCN110010000000003" {
			gotLAUS++
			if o.FIPS != "11001" || o.Metric != types.MetricUnemploymentRate || o.Unit != types.UnitPercent {
				t.Errorf("LAUS row meta wrong: %+v", o)
			}
		}
	}
	if gotLAUS != 3 {
		t.Errorf("want 3 LAUS rows, got %d", gotLAUS)
	}
}

func TestParseResponseNonSuccessStatus(t *testing.T) {
	raw := apiResponse{Status: "REQUEST_FAILED", Message: []string{"bad key"}}
	_, err := ParseResponse(raw, map[string]seriesMeta{}, nil)
	if err == nil {
		t.Fatal("want error on non-success status")
	}
}

func TestFetchAgainstFakeServer(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("testdata", "bls_response.json"))
	if err != nil {
		t.Fatalf("fixture read: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "want POST", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(data)
	}))
	defer srv.Close()

	src := New(Config{APIKey: "k"}, httpclient.New(httpclient.Options{Timeout: 5 * time.Second}))
	src.apiURL = srv.URL

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	obs, err := src.Fetch(ctx)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(obs) != 4 {
		t.Fatalf("want 4 obs from fake server, got %d", len(obs))
	}
}
