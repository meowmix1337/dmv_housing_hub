package fred

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

// newTestServer routes by ?series_id= to fixture files in testdata/.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seriesID := r.URL.Query().Get("series_id")
		if seriesID == "" {
			http.Error(w, "missing series_id", http.StatusBadRequest)
			return
		}
		path := filepath.Join("testdata", "series_"+seriesID+".json")
		data, err := os.ReadFile(path)
		if err != nil {
			// Treat as 404 to mirror FRED's behavior for unknown series.
			http.Error(w, "unknown series", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(data)
	}))
}

func newTestSource(t *testing.T, srv *httptest.Server) *Source {
	t.Helper()
	s := New(Config{APIKey: "test"}, httpclient.New(httpclient.Options{MaxRetries: 1}))
	s.baseURL = srv.URL
	s.countySleep = 0 // disable rate-limit sleep
	return s
}

func TestFetchSeriesHappyPath(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	s := newTestSource(t, srv)

	obs, err := s.fetchSeries(context.Background(), "MORTGAGE30US")
	if err != nil {
		t.Fatalf("fetchSeries: %v", err)
	}
	if got, want := len(obs), 4; got != want {
		t.Fatalf("len: got %d, want %d", got, want)
	}
	if !obs[0].Value.Valid || obs[0].Value.Val != 7.33 {
		t.Errorf("first obs: got %+v", obs[0])
	}
	// "." sentinel observation comes back as MaybeFloat{Valid: false}.
	if obs[2].Value.Valid {
		t.Errorf("dot sentinel: expected Valid=false, got %+v", obs[2])
	}
}

func TestToObservationsSkipsSentinel(t *testing.T) {
	in := []fredObservation{
		{Date: "2020-01-01", Value: types.MaybeFloat{Val: 1.0, Valid: true}},
		{Date: "2020-02-01", Value: types.MaybeFloat{Valid: false}},
		{Date: "2020-03-01", Value: types.MaybeFloat{Val: 2.0, Valid: true}},
	}
	spec := seriesSpec{metric: types.MetricFhfaHpi, unit: types.UnitIndexOther}
	out := toObservations(in, spec, "11001", "ATNHPIUS11001A")
	if got, want := len(out), 2; got != want {
		t.Errorf("len: got %d, want %d", got, want)
	}
	for _, o := range out {
		if o.Source != "fred" {
			t.Errorf("source: got %q, want fred", o.Source)
		}
		if o.FIPS != "11001" {
			t.Errorf("fips: got %q, want 11001", o.FIPS)
		}
		if o.Series != "ATNHPIUS11001A" {
			t.Errorf("series: got %q", o.Series)
		}
	}
}

func TestFetchPartialFailureContinues(t *testing.T) {
	// Server returns 404 for HOSCCOUNTY series; 200 for everything else.
	// Fetch should not abort.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seriesID := r.URL.Query().Get("series_id")
		if strings.HasPrefix(seriesID, "HOSCCOUNTY") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		// Stub a tiny payload for everything else.
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"observations":[{"date":"2024-01-01","value":"42"}]}`))
	}))
	defer srv.Close()

	s := newTestSource(t, srv)
	// Time-box: 21 counties × 3 county series + a few national/state should still
	// complete well under 5s with countySleep=0.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	obs, err := s.Fetch(ctx)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	// At least the 2 national series + 3 state series should have produced observations.
	if len(obs) == 0 {
		t.Fatal("expected some observations even with HOSCCOUNTY 404s")
	}
	// No observation should have series prefix HOSCCOUNTY (all failed).
	for _, o := range obs {
		if strings.HasPrefix(o.Series, "HOSCCOUNTY") {
			t.Errorf("unexpected HOSCCOUNTY obs in output: %+v", o)
		}
	}
}
