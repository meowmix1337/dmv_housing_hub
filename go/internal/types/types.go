// Package types is the Go mirror of shared/src/types.ts. It is hand-maintained;
// the contract test in this package guards drift against a representative
// CountySummary golden captured from web/public/data/counties/.
package types

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
)

type Cadence string

const (
	CadenceDaily     Cadence = "daily"
	CadenceWeekly    Cadence = "weekly"
	CadenceMonthly   Cadence = "monthly"
	CadenceQuarterly Cadence = "quarterly"
	CadenceAnnual    Cadence = "annual"
)

type Jurisdiction string

const (
	JurisdictionDC Jurisdiction = "DC"
	JurisdictionMD Jurisdiction = "MD"
	JurisdictionVA Jurisdiction = "VA"
)

type MetricId string

const (
	MetricFhfaHpi              MetricId = "fhfa_hpi"
	MetricMedianSalePrice      MetricId = "median_sale_price"
	MetricMedianListPrice      MetricId = "median_list_price"
	MetricMedianPricePerSqft   MetricId = "median_price_per_sqft"
	MetricZhviAllHomes         MetricId = "zhvi_all_homes"
	MetricZhviSFH              MetricId = "zhvi_sfh"
	MetricZhviCondo            MetricId = "zhvi_condo"
	MetricZoriRent             MetricId = "zori_rent"
	MetricActiveListings       MetricId = "active_listings"
	MetricNewListings          MetricId = "new_listings"
	MetricHomesSold            MetricId = "homes_sold"
	MetricMonthsSupply         MetricId = "months_supply"
	MetricDaysOnMarket         MetricId = "days_on_market"
	MetricSaleToListRatio      MetricId = "sale_to_list_ratio"
	MetricPctSoldAboveList     MetricId = "pct_sold_above_list"
	MetricPctPriceDrops        MetricId = "pct_price_drops"
	MetricMortgage30yRate      MetricId = "mortgage_30y_rate"
	MetricMortgage15yRate      MetricId = "mortgage_15y_rate"
	MetricMedianHouseholdInc   MetricId = "median_household_income"
	MetricMedianHomeValue      MetricId = "median_home_value"
	MetricMedianGrossRent      MetricId = "median_gross_rent"
	MetricUnemploymentRate     MetricId = "unemployment_rate"
	MetricFederalEmployment    MetricId = "federal_employment"
	MetricBuildingPermits      MetricId = "building_permits"
	MetricHotnessScore         MetricId = "hotness_score"
	MetricHotnessRank          MetricId = "hotness_rank"
	MetricPopulation           MetricId = "population"
)

func (m MetricId) Valid() bool {
	switch m {
	case MetricFhfaHpi, MetricMedianSalePrice, MetricMedianListPrice,
		MetricMedianPricePerSqft, MetricZhviAllHomes, MetricZhviSFH,
		MetricZhviCondo, MetricZoriRent, MetricActiveListings,
		MetricNewListings, MetricHomesSold, MetricMonthsSupply,
		MetricDaysOnMarket, MetricSaleToListRatio, MetricPctSoldAboveList,
		MetricPctPriceDrops, MetricMortgage30yRate, MetricMortgage15yRate,
		MetricMedianHouseholdInc, MetricMedianHomeValue, MetricMedianGrossRent,
		MetricUnemploymentRate, MetricFederalEmployment, MetricBuildingPermits,
		MetricHotnessScore, MetricHotnessRank, MetricPopulation:
		return true
	}
	return false
}

type Unit string

const (
	UnitUSD          Unit = "USD"
	UnitUSDPerSqft   Unit = "USD_per_sqft"
	UnitPercent      Unit = "percent"
	UnitRatio        Unit = "ratio"
	UnitDays         Unit = "days"
	UnitMonths       Unit = "months"
	UnitCount        Unit = "count"
	UnitIndex2000    Unit = "index_2000=100"
	UnitIndexOther   Unit = "index_other"
)

// Observation is the atomic output of every ingester.
type Observation struct {
	Source     string   `json:"source"`
	Series     string   `json:"series"`
	FIPS       string   `json:"fips"`
	Metric     MetricId `json:"metric"`
	ObservedAt string   `json:"observedAt"`
	Value      float64  `json:"value"`
	Unit       Unit     `json:"unit"`
	MOE        *float64 `json:"moe,omitempty"`
}

// IngestResult is the on-disk cache shape under .cache/{source}.json.
// Wrapper matches scripts/ingest/DataSource.ts IngestResult plus a "count" field
// the TS pipeline writes alongside.
type IngestResult struct {
	Source       string        `json:"source"`
	Observations []Observation `json:"observations"`
	StartedAt    string        `json:"startedAt"`
	FinishedAt   string        `json:"finishedAt"`
	DurationMs   int64         `json:"durationMs"`
	Count        int           `json:"count"`
}

type MetricPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

type MetricSeries struct {
	Metric      MetricId      `json:"metric"`
	FIPS        string        `json:"fips"`
	Unit        Unit          `json:"unit"`
	Cadence     Cadence       `json:"cadence"`
	Source      string        `json:"source"`
	LastUpdated string        `json:"lastUpdated"`
	Points      []MetricPoint `json:"points"`
}

type CountyForecast struct {
	Source            string   `json:"source"`
	Metric            MetricId `json:"metric"`
	HorizonMonths     int      `json:"horizonMonths"`
	ForecastValue     float64  `json:"forecastValue"`
	ForecastChangePct float64  `json:"forecastChangePct"`
	PublishedAt       string   `json:"publishedAt"`
}

type CountyCurrentSnapshot struct {
	MedianSalePrice        *float64 `json:"medianSalePrice,omitempty"`
	MedianSalePriceYoY     *float64 `json:"medianSalePriceYoY,omitempty"`
	Zhvi                   *float64 `json:"zhvi,omitempty"`
	ZhviYoY                *float64 `json:"zhviYoY,omitempty"`
	DaysOnMarket           *float64 `json:"daysOnMarket,omitempty"`
	MonthsSupply           *float64 `json:"monthsSupply,omitempty"`
	SaleToListRatio        *float64 `json:"saleToListRatio,omitempty"`
	PctSoldAboveList       *float64 `json:"pctSoldAboveList,omitempty"`
	UnemploymentRate       *float64 `json:"unemploymentRate,omitempty"`
	FederalEmployment      *float64 `json:"federalEmployment,omitempty"`
	FederalEmploymentYoY   *float64 `json:"federalEmploymentYoY,omitempty"`
	FederalEmploymentAsOf  *string  `json:"federalEmploymentAsOf,omitempty"`
	ActiveListings         *float64 `json:"activeListings,omitempty"`
	ActiveListingsYoY      *float64 `json:"activeListingsYoY,omitempty"`
	MarketHealthScore      *float64 `json:"marketHealthScore,omitempty"`
	AffordabilityIndex     *float64 `json:"affordabilityIndex,omitempty"`
}

type ActiveListingsByType struct {
	SingleFamily []MetricPoint `json:"single_family"`
	Condo        []MetricPoint `json:"condo"`
	Townhouse    []MetricPoint `json:"townhouse"`
	MultiFamily  []MetricPoint `json:"multi_family"`
}

type ActiveListingsBreakdown struct {
	Total  []MetricPoint        `json:"total"`
	ByType ActiveListingsByType `json:"byType"`
}

type CountySeries struct {
	FhfaHpi           []MetricPoint            `json:"fhfaHpi,omitempty"`
	Zhvi              []MetricPoint            `json:"zhvi,omitempty"`
	MedianSalePrice   []MetricPoint            `json:"medianSalePrice,omitempty"`
	DaysOnMarket      []MetricPoint            `json:"daysOnMarket,omitempty"`
	ActiveListings    *ActiveListingsBreakdown `json:"activeListings,omitempty"`
	FederalEmployment []MetricPoint            `json:"federalEmployment,omitempty"`
}

type CountySummary struct {
	FIPS                  string                `json:"fips"`
	Name                  string                `json:"name"`
	Jurisdiction          Jurisdiction          `json:"jurisdiction"`
	Population            *float64              `json:"population,omitempty"`
	MedianHouseholdIncome *float64              `json:"medianHouseholdIncome,omitempty"`
	PropertyTaxRate       *float64              `json:"propertyTaxRate,omitempty"`
	LastUpdated           string                `json:"lastUpdated"`
	Current               CountyCurrentSnapshot `json:"current"`
	Series                CountySeries          `json:"series"`
	Forecasts             []CountyForecast      `json:"forecasts,omitempty"`
}

type ManifestSourceEntry struct {
	Name         string  `json:"name"`
	LastUpdated  string  `json:"lastUpdated"`
	Cadence      Cadence `json:"cadence"`
	Status       string  `json:"status"`
	LastVerified *string `json:"lastVerified,omitempty"`
}

type Manifest struct {
	GeneratedAt string                `json:"generatedAt"`
	Sources     []ManifestSourceEntry `json:"sources"`
}

type ActiveListingsDmv struct {
	Metric           string                  `json:"metric"`
	FIPS             string                  `json:"fips"`
	Unit             string                  `json:"unit"`
	Cadence          string                  `json:"cadence"`
	Source           string                  `json:"source"`
	LastUpdated      string                  `json:"lastUpdated"`
	Aggregation      string                  `json:"aggregation"`
	ContributingFips []string                `json:"contributingFips"`
	AsOf             string                  `json:"asOf"`
	Latest           ActiveListingsDmvLatest `json:"latest"`
	LatestYoY        *float64                `json:"latestYoY,omitempty"`
	Series           ActiveListingsBreakdown `json:"series"`
	Coverage         DmvCoverage             `json:"coverage"`
}

type ActiveListingsDmvLatest struct {
	Total  float64                       `json:"total"`
	ByType ActiveListingsDmvLatestByType `json:"byType"`
}

type ActiveListingsDmvLatestByType struct {
	SingleFamily float64 `json:"single_family"`
	Condo        float64 `json:"condo"`
	Townhouse    float64 `json:"townhouse"`
	MultiFamily  float64 `json:"multi_family"`
}

type DmvCoverage struct {
	FIPS    []string `json:"fips"`
	Missing []string `json:"missing"`
}

type FederalEmploymentDmv struct {
	Metric           string        `json:"metric"`
	FIPS             string        `json:"fips"`
	Unit             string        `json:"unit"`
	Cadence          string        `json:"cadence"`
	Source           string        `json:"source"`
	LastUpdated      string        `json:"lastUpdated"`
	Aggregation      string        `json:"aggregation"`
	ContributingFips []string      `json:"contributingFips"`
	Coverage         DmvCoverage   `json:"coverage"`
	Total            float64       `json:"total"`
	TotalYoY         *float64      `json:"totalYoY,omitempty"`
	AsOf             string        `json:"asOf"`
	Points           []MetricPoint `json:"points"`
}

// MaybeFloat carries an optional numeric observation that may arrive from
// upstream as a number, null, or a sentinel string (e.g. FRED's ".").
// JSON round-trips: null/sentinel -> Valid=false; otherwise the number.
type MaybeFloat struct {
	Val   float64
	Valid bool
}

func (m *MaybeFloat) UnmarshalJSON(data []byte) error {
	if bytes.Equal(data, []byte("null")) {
		m.Valid = false
		return nil
	}
	// Try number first (fast path).
	var n float64
	if err := json.Unmarshal(data, &n); err == nil {
		m.Val = n
		m.Valid = true
		return nil
	}
	// Fall back to string (FRED "." sentinel or stringified number).
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("MaybeFloat: expected number, null, or string, got %s", string(data))
	}
	if s == "" || s == "." {
		m.Valid = false
		return nil
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return fmt.Errorf("MaybeFloat: cannot parse %q as float: %w", s, err)
	}
	m.Val = f
	m.Valid = true
	return nil
}

func (m MaybeFloat) MarshalJSON() ([]byte, error) {
	if !m.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(m.Val)
}
