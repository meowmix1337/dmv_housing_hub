package transform

// PropertyTaxRates is a static lookup of FY2025/2026 real-property tax rates
// per FIPS, as decimals (e.g. 0.0085 = $0.85 per $100 AV).
// Mirrors scripts/lib/property-tax-rates.ts.
//
// Sources cited per row:
//   DC OTR (otr.cfo.dc.gov), Maryland SDAT (sdat.maryland.gov),
//   Virginia DOT (tax.virginia.gov).
var PropertyTaxRates = map[string]float64{
	"11001": 0.0085,   // District of Columbia (FY2026: $0.85)

	"24003": 0.009038, // Anne Arundel County
	"24005": 0.011,    // Baltimore County
	"24009": 0.008635, // Calvert County
	"24017": 0.01225,  // Charles County
	"24021": 0.010624, // Frederick County
	"24027": 0.01014,  // Howard County
	"24031": 0.01,     // Montgomery County (county portion)
	"24033": 0.01,     // Prince George's County
	"24510": 0.02248,  // Baltimore city

	"51013": 0.01013,  // Arlington County
	"51059": 0.01135,  // Fairfax County
	"51107": 0.00875,  // Loudoun County
	"51153": 0.01125,  // Prince William County
	"51177": 0.0088,   // Spotsylvania County
	"51179": 0.009195, // Stafford County
	"51510": 0.0111,   // Alexandria city
	"51600": 0.01075,  // Fairfax city
	"51610": 0.01355,  // Falls Church city
	"51683": 0.0119,   // Manassas city
	"51685": 0.01185,  // Manassas Park city
}
