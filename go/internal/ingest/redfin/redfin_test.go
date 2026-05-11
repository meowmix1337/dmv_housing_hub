package redfin

import (
	"compress/gzip"
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

func TestBuildFipsIndex(t *testing.T) {
	idx := BuildFipsIndex()
	cases := []struct {
		key, want string
	}{
		{"DC:district of columbia", "11001"},
		{"VA:alexandria city", "51510"},
		{"VA:alexandria", "51510"},
		{"MD:frederick county", "24021"},
		{"MD:baltimore city county", "24510"},
		{"MD:baltimore city", "24510"},
	}
	for _, c := range cases {
		got := idx[c.key]
		if got != c.want {
			t.Errorf("idx[%q]=%q want %q", c.key, got, c.want)
		}
	}
	// VA has no Frederick County in DMV — the state-prefix scheme should
	// keep MD's entry from leaking across.
	if v := idx["VA:frederick county"]; v != "" {
		t.Errorf("VA:frederick county should be absent, got %q", v)
	}
}

func loadFixture(t *testing.T) string {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", "redfin_sample.tsv"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return string(body)
}

func TestParseStreamFiltersAndEmits(t *testing.T) {
	body := loadFixture(t)
	obs, err := ParseStream(strings.NewReader(body), BuildFipsIndex(), nil)
	if err != nil {
		t.Fatalf("ParseStream: %v", err)
	}
	// 5 matched rows × 11 metrics each = 55.
	// (DC×2, Baltimore City alias, Howard MD, Alexandria VA. The
	// "Frederick County, VA" fixture row has STATE_CODE=VA but no VA
	// Frederick is in DMV, so it must be filtered — and crucially it
	// must NOT bleed across to MD's Frederick at 24021.)
	if got, want := len(obs), 55; got != want {
		t.Fatalf("count: got %d want %d", got, want)
	}
	for _, o := range obs {
		if o.FIPS == "24021" {
			t.Errorf("MD Frederick should not appear from a VA-coded row")
		}
		if o.Source != "redfin" {
			t.Errorf("source: %q", o.Source)
		}
	}

	// Baltimore City County alias resolves to 24510.
	balt := 0
	for _, o := range obs {
		if o.FIPS == "24510" {
			balt++
		}
	}
	if balt != 11 {
		t.Errorf("Baltimore City County: got %d obs want 11", balt)
	}

	// Property-type slugs propagate to series IDs.
	series := map[string]bool{}
	for _, o := range obs {
		series[o.Series] = true
	}
	for _, want := range []string{
		"redfin:county:all_residential",
		"redfin:county:single_family",
		"redfin:county:condo",
		"redfin:county:townhouse",
	} {
		if !series[want] {
			t.Errorf("missing series %q", want)
		}
	}
}

func TestFieldAt(t *testing.T) {
	line := "a\tbb\t\tccc\td"
	cases := []struct {
		n    int
		want string
	}{
		{0, "a"},
		{1, "bb"},
		{2, ""},
		{3, "ccc"},
		{4, "d"},
		{5, ""},
	}
	for _, c := range cases {
		if got := fieldAt(line, c.n); got != c.want {
			t.Errorf("fieldAt(%d) = %q want %q", c.n, got, c.want)
		}
	}
}

func TestFetchAgainstFakeServer(t *testing.T) {
	body := loadFixture(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/gzip")
		gz := gzip.NewWriter(w)
		_, _ = gz.Write([]byte(body))
		_ = gz.Close()
	}))
	defer srv.Close()

	src := New(httpclient.New(httpclient.Options{Timeout: 5 * time.Second}))
	src.SetURL(srv.URL)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	obs, err := src.Fetch(ctx)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(obs) != 55 {
		t.Fatalf("want 55 from fake server, got %d", len(obs))
	}
	if obs[0].ObservedAt != "2024-01-31" {
		t.Errorf("observedAt: got %q", obs[0].ObservedAt)
	}
	if obs[0].Metric != types.MetricMedianSalePrice {
		t.Errorf("first metric: got %q want median_sale_price", obs[0].Metric)
	}
}
