// Package redfin ports scripts/ingest/redfin.ts. Streams the Redfin county
// market tracker (~32MB gzipped) through gzip.NewReader + bufio.Scanner,
// filtering DMV state_code rows on the fly to stay under the 256MB RSS cap.
package redfin

import (
	"bufio"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

const defaultURL = "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz"

var dmvStateCodes = map[string]struct{}{"DC": {}, "MD": {}, "VA": {}}

type columnSpec struct {
	metric types.MetricId
	unit   types.Unit
}

var columnMap = []struct {
	name string
	spec columnSpec
}{
	{"MEDIAN_SALE_PRICE", columnSpec{types.MetricMedianSalePrice, types.UnitUSD}},
	{"MEDIAN_LIST_PRICE", columnSpec{types.MetricMedianListPrice, types.UnitUSD}},
	{"MEDIAN_PPSF", columnSpec{types.MetricMedianPricePerSqft, types.UnitUSDPerSqft}},
	{"HOMES_SOLD", columnSpec{types.MetricHomesSold, types.UnitCount}},
	{"NEW_LISTINGS", columnSpec{types.MetricNewListings, types.UnitCount}},
	{"INVENTORY", columnSpec{types.MetricActiveListings, types.UnitCount}},
	{"MONTHS_OF_SUPPLY", columnSpec{types.MetricMonthsSupply, types.UnitMonths}},
	{"MEDIAN_DOM", columnSpec{types.MetricDaysOnMarket, types.UnitDays}},
	{"AVG_SALE_TO_LIST", columnSpec{types.MetricSaleToListRatio, types.UnitRatio}},
	{"SOLD_ABOVE_LIST", columnSpec{types.MetricPctSoldAboveList, types.UnitPercent}},
	{"PRICE_DROPS", columnSpec{types.MetricPctPriceDrops, types.UnitPercent}},
}

var propertyTypeSlugs = map[string]string{
	"All Residential":            "all_residential",
	"Single Family Residential":  "single_family",
	"Condo/Co-op":                "condo",
	"Townhouse":                  "townhouse",
	"Multi-Family (2-4 Unit)":    "multi_family",
}

// BuildFipsIndex keys lookups by "STATE_CODE:lowercase-county-name" to avoid
// VA/MD collisions on shared names (Montgomery, Frederick). Also adds the
// Redfin alias for Baltimore city, which ships as "Baltimore City County".
func BuildFipsIndex() map[string]string {
	m := make(map[string]string, len(counties.All())*2)
	add := func(state, name, fips string) {
		m[state+":"+strings.ToLower(name)] = fips
	}
	for _, c := range counties.All() {
		state := jurisdictionToStateCode(c.StateFips)
		add(state, c.Name, c.FIPS)
		if strings.HasSuffix(strings.ToLower(c.Name), " city") {
			add(state, c.Name[:len(c.Name)-len(" city")], c.FIPS)
		}
	}
	add("MD", "Baltimore City County", "24510")
	return m
}

func jurisdictionToStateCode(stateFips string) string {
	switch stateFips {
	case "11":
		return "DC"
	case "24":
		return "MD"
	case "51":
		return "VA"
	}
	return ""
}

type Source struct {
	client *httpclient.Client
	logger *slog.Logger
	url    string // override for tests
}

func New(client *httpclient.Client) *Source {
	return &Source{client: client, logger: pkglog.Default(), url: defaultURL}
}

// SetURL overrides the download URL (tests).
func (s *Source) SetURL(u string) { s.url = u }

func (s *Source) Name() string           { return "redfin" }
func (s *Source) Cadence() types.Cadence { return types.CadenceWeekly }

func (s *Source) Fetch(ctx context.Context) ([]types.Observation, error) {
	s.logger.Info("redfin: fetching county market tracker", "url", s.url)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.url, nil)
	if err != nil {
		return nil, fmt.Errorf("new redfin request: %w", err)
	}
	resp, err := s.client.Do(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("redfin download: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("redfin gzip: %w", err)
	}
	defer func() { _ = gz.Close() }()

	return ParseStream(gz, BuildFipsIndex(), s.logger)
}

// ParseStream reads an unzipped TSV from r, filters DMV rows, and emits
// one observation per non-empty COLUMN_MAP cell. The first line is the
// header. Exported for unit tests so they don't need HTTP+gzip plumbing.
func ParseStream(r io.Reader, fipsIndex map[string]string, logger *slog.Logger) ([]types.Observation, error) {
	if logger == nil {
		logger = pkglog.Default()
	}
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 1<<20), 32<<20)

	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return nil, fmt.Errorf("redfin scan header: %w", err)
		}
		return nil, fmt.Errorf("redfin: empty stream")
	}
	header := strings.Split(scanner.Text(), "\t")
	idx := make(map[string]int, len(header))
	for i, h := range header {
		idx[unquote(h)] = i
	}

	// Resolve required column indices once.
	mustCol := func(name string) (int, error) {
		i, ok := idx[name]
		if !ok {
			return -1, fmt.Errorf("redfin: missing required column %q", name)
		}
		return i, nil
	}
	colPeriodDuration, err := mustCol("PERIOD_DURATION")
	if err != nil {
		return nil, err
	}
	colRegionType, err := mustCol("REGION_TYPE")
	if err != nil {
		return nil, err
	}
	colStateCode, err := mustCol("STATE_CODE")
	if err != nil {
		return nil, err
	}
	colRegion, err := mustCol("REGION")
	if err != nil {
		return nil, err
	}
	colPropertyType, err := mustCol("PROPERTY_TYPE")
	if err != nil {
		return nil, err
	}
	colPeriodEnd, err := mustCol("PERIOD_END")
	if err != nil {
		return nil, err
	}

	type metricCol struct {
		col  int
		spec columnSpec
	}
	metricCols := make([]metricCol, 0, len(columnMap))
	for _, cm := range columnMap {
		if i, ok := idx[cm.name]; ok {
			metricCols = append(metricCols, metricCol{col: i, spec: cm.spec})
		}
	}

	out := make([]types.Observation, 0, 1<<16)
	rowsRead := 0
	unrecognized := map[string]int{}

	for scanner.Scan() {
		line := scanner.Text()
		rowsRead++

		// Cheap pre-checks before any allocation: locate STATE_CODE field.
		// String fields in this TSV are double-quoted; numeric fields are not.
		// unquote handles both.
		stateCode := unquote(fieldAt(line, colStateCode))
		if _, ok := dmvStateCodes[stateCode]; !ok {
			continue
		}
		if unquote(fieldAt(line, colPeriodDuration)) != "30" {
			continue
		}
		if unquote(fieldAt(line, colRegionType)) != "county" {
			continue
		}
		propertyType := unquote(fieldAt(line, colPropertyType))
		slug, ok := propertyTypeSlugs[propertyType]
		if !ok {
			unrecognized[propertyType]++
			continue
		}
		periodEnd := unquote(fieldAt(line, colPeriodEnd))
		if periodEnd == "" {
			continue
		}
		region := unquote(fieldAt(line, colRegion))
		suffix := ", " + stateCode
		countyName := region
		if strings.HasSuffix(region, suffix) {
			countyName = region[:len(region)-len(suffix)]
		}
		fips, ok := fipsIndex[stateCode+":"+strings.ToLower(countyName)]
		if !ok {
			logger.Debug("redfin: county not in DMV area; skipping", "region", region, "state_code", stateCode)
			continue
		}

		// At this point allocate the field slice once.
		fields := strings.Split(line, "\t")
		series := "redfin:county:" + slug
		for _, mc := range metricCols {
			if mc.col >= len(fields) {
				continue
			}
			raw := strings.TrimSpace(unquote(fields[mc.col]))
			if raw == "" {
				continue
			}
			val, err := strconv.ParseFloat(raw, 64)
			if err != nil {
				continue
			}
			out = append(out, types.Observation{
				Source:     "redfin",
				Series:     series,
				FIPS:       fips,
				Metric:     mc.spec.metric,
				ObservedAt: periodEnd,
				Value:      val,
				Unit:       mc.spec.unit,
			})
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("redfin scan: %w", err)
	}
	for pt, n := range unrecognized {
		logger.Warn("redfin: unrecognized property type; skipped", "property_type", pt, "count", n)
	}
	logger.Info("redfin: pipeline complete", "rows_read", rowsRead, "observations", len(out))
	return out, nil
}

// unquote strips a single pair of surrounding double-quotes if present.
// Redfin's TSV double-quotes string fields and leaves numeric fields bare;
// the dump has no escaped quotes inside, so we can rely on the simple form.
func unquote(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}

// fieldAt returns the n-th tab-separated field of line without allocating
// a full slice. Used to filter rows cheaply before deciding to keep them.
func fieldAt(line string, n int) string {
	if n < 0 {
		return ""
	}
	start := 0
	idx := 0
	for i := 0; i < len(line); i++ {
		if line[i] == '\t' {
			if idx == n {
				return line[start:i]
			}
			idx++
			start = i + 1
		}
	}
	if idx == n {
		return line[start:]
	}
	return ""
}
