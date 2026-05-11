// Package qcew ports scripts/ingest/qcew.ts. For every quarter from 2015 Q1
// through the current quarter, downloads the BLS QCEW per-county CSV, picks
// out the federal-county-total row (own_code=1, agglvl_code=71,
// industry_code=10), and emits one observation per (county, quarter).
package qcew

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/meowmix1337/dmv_housing_hub/go/internal/counties"
	httpclient "github.com/meowmix1337/dmv_housing_hub/go/internal/http"
	pkglog "github.com/meowmix1337/dmv_housing_hub/go/internal/log"
	"github.com/meowmix1337/dmv_housing_hub/go/internal/types"
)

const (
	qcewBase    = "https://data.bls.gov/cew/data/api"
	startYear   = 2015
	concurrency = 4
)

// Row holds the few QCEW columns we care about.
type Row struct {
	AreaFIPS        string
	OwnCode         string
	IndustryCode    string
	AgglvlCode      string
	Year            string
	Qtr             string
	DisclosureCode  string
	Month3Emplvl    string
}

type task struct {
	fips string
	year int
	qtr  int
}

type Source struct {
	client   *httpclient.Client
	logger   *slog.Logger
	baseURL  string // override for tests
	now      func() time.Time
}

func New(client *httpclient.Client) *Source {
	return &Source{
		client:  client,
		logger:  pkglog.Default(),
		baseURL: qcewBase,
		now:     func() time.Time { return time.Now().UTC() },
	}
}

func (s *Source) Name() string           { return "qcew" }
func (s *Source) Cadence() types.Cadence { return types.CadenceQuarterly }

func (s *Source) Fetch(ctx context.Context) ([]types.Observation, error) {
	now := s.now()
	curYear := now.Year()
	curQtr := (int(now.Month())-1)/3 + 1

	cs := counties.All()
	tasks := make([]task, 0, len(cs)*12*4)
	for y := startYear; y <= curYear; y++ {
		for q := 1; q <= 4; q++ {
			if y == curYear && q > curQtr {
				continue
			}
			for _, c := range cs {
				tasks = append(tasks, task{fips: c.FIPS, year: y, qtr: q})
			}
		}
	}
	s.logger.Info("qcew: starting fetch", "count", len(tasks))

	results := make([]*types.Observation, len(tasks))
	var nextIdx int
	var mu sync.Mutex
	var wg sync.WaitGroup
	var fatalErr error
	var errOnce sync.Once

	workerN := concurrency
	if workerN > len(tasks) {
		workerN = len(tasks)
	}
	for w := 0; w < workerN; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				mu.Lock()
				i := nextIdx
				nextIdx++
				mu.Unlock()
				if i >= len(tasks) {
					return
				}
				if ctx.Err() != nil {
					return
				}
				obs, err := s.fetchOne(ctx, tasks[i])
				if err != nil {
					errOnce.Do(func() { fatalErr = err })
					return
				}
				results[i] = obs
			}
		}()
	}
	wg.Wait()

	if fatalErr != nil {
		return nil, fatalErr
	}

	out := make([]types.Observation, 0, len(results))
	for _, r := range results {
		if r != nil {
			out = append(out, *r)
		}
	}
	s.logger.Info("qcew: fetch complete", "count", len(out))
	return out, nil
}

func (s *Source) fetchOne(ctx context.Context, t task) (*types.Observation, error) {
	url := fmt.Sprintf("%s/%d/%d/area/%s.csv", s.baseURL, t.year, t.qtr, t.fips)
	label := fmt.Sprintf("qcew:%s:%dQ%d", t.fips, t.year, t.qtr)

	body, err := s.client.GetText(ctx, url, label)
	if err != nil {
		var httpErr *httpclient.HTTPError
		if errors.As(err, &httpErr) && httpErr.Status == http.StatusNotFound {
			s.logger.Warn("qcew: 404 (data not yet published); skipping",
				"fips", t.fips, "year", t.year, "qtr", t.qtr)
			return nil, nil
		}
		return nil, fmt.Errorf("qcew fetch %s: %w", label, err)
	}

	rows, err := ParseCSV(body)
	if err != nil {
		return nil, fmt.Errorf("qcew parse %s: %w", label, err)
	}
	row := SelectFederalCountyTotal(rows)
	if row == nil {
		s.logger.Warn("qcew: federal county total row not found; skipping",
			"fips", t.fips, "year", t.year, "qtr", t.qtr)
		return nil, nil
	}
	obs := RowToObservation(*row, t.fips, s.logger)
	return obs, nil
}

// ParseCSV decodes the body into Rows. Tolerates extra columns; pulls fields by header name.
func ParseCSV(body string) ([]Row, error) {
	r := csv.NewReader(strings.NewReader(body))
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	idx := make(map[string]int, len(header))
	for i, h := range header {
		idx[h] = i
	}
	get := func(rec []string, name string) string {
		i, ok := idx[name]
		if !ok || i >= len(rec) {
			return ""
		}
		return rec[i]
	}

	out := make([]Row, 0, 200)
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read record: %w", err)
		}
		out = append(out, Row{
			AreaFIPS:       get(rec, "area_fips"),
			OwnCode:        get(rec, "own_code"),
			IndustryCode:   get(rec, "industry_code"),
			AgglvlCode:     get(rec, "agglvl_code"),
			Year:           get(rec, "year"),
			Qtr:            get(rec, "qtr"),
			DisclosureCode: get(rec, "disclosure_code"),
			Month3Emplvl:   get(rec, "month3_emplvl"),
		})
	}
	return out, nil
}

// SelectFederalCountyTotal picks the row matching own_code=1, agglvl_code=71, industry_code=10.
func SelectFederalCountyTotal(rows []Row) *Row {
	for i := range rows {
		r := &rows[i]
		if r.OwnCode == "1" && r.AgglvlCode == "71" && r.IndustryCode == "10" {
			return r
		}
	}
	return nil
}

// QuarterToObservedAt converts year+qtr to the ISO date used by TS (end-of-quarter month, day 01).
func QuarterToObservedAt(year, qtr int) string {
	var mm string
	switch qtr {
	case 1:
		mm = "03"
	case 2:
		mm = "06"
	case 3:
		mm = "09"
	case 4:
		mm = "12"
	default:
		return ""
	}
	return fmt.Sprintf("%d-%s-01", year, mm)
}

// RowToObservation converts a federal-county-total row to an Observation, or returns nil if
// the row is suppressed or non-numeric.
func RowToObservation(r Row, fips string, logger *slog.Logger) *types.Observation {
	if logger == nil {
		logger = pkglog.Default()
	}
	if r.DisclosureCode == "N" {
		logger.Warn("qcew: suppressed; skipping", "fips", fips, "year", r.Year, "qtr", r.Qtr)
		return nil
	}
	val, err := strconv.ParseFloat(r.Month3Emplvl, 64)
	if err != nil {
		logger.Warn("qcew: non-finite value; skipping",
			"fips", fips, "year", r.Year, "qtr", r.Qtr, "value", r.Month3Emplvl)
		return nil
	}
	year, err := strconv.Atoi(r.Year)
	if err != nil {
		return nil
	}
	qtr, err := strconv.Atoi(r.Qtr)
	if err != nil {
		return nil
	}
	return &types.Observation{
		Source:     "qcew",
		Series:     fmt.Sprintf("qcew:%s:%sQ%s:own1:naics10", fips, r.Year, r.Qtr),
		FIPS:       fips,
		Metric:     types.MetricFederalEmployment,
		ObservedAt: QuarterToObservedAt(year, qtr),
		Value:      val,
		Unit:       types.UnitCount,
	}
}
