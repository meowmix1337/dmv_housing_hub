// Published real-property tax rates (FY 2025/2026) as decimals.
// Sources cited per row below.

export const PROPERTY_TAX_RATES: Record<string, number> = {
  // DC — FY2026 real property rate: $0.85 per $100 assessed value
  // Source: DC Office of Tax and Revenue otr.cfo.dc.gov
  '11001': 0.0085,

  // Maryland counties — FY2026 county rates per $100 AV
  // Source: Maryland State Department of Assessments and Taxation (SDAT) sdat.maryland.gov

  // Anne Arundel County: $0.9038
  '24003': 0.009038,
  // Baltimore County: $1.1
  '24005': 0.011,
  // Calvert County: $0.8635
  '24009': 0.008635,
  // Charles County: $1.225
  '24017': 0.01225,
  // Frederick County: $1.0624
  '24021': 0.010624,
  // Howard County: $1.014
  '24027': 0.01014,
  // Montgomery County: $1.0 (county portion; excludes special taxing districts)
  '24031': 0.01,
  // Prince George's County: $1.0 (county rate)
  '24033': 0.01,
  // Baltimore city: $2.248 (independent city; combined city+county rate)
  '24510': 0.02248,

  // Virginia localities — FY2025/2026 real estate tax rates per $100 AV
  // Source: Virginia Department of Taxation tax.virginia.gov

  // Arlington County: $1.013
  '51013': 0.01013,
  // Fairfax County: $1.135
  '51059': 0.01135,
  // Loudoun County: $0.875
  '51107': 0.00875,
  // Prince William County: $1.125
  '51153': 0.01125,
  // Spotsylvania County: $0.88
  '51177': 0.0088,
  // Stafford County: $0.9195
  '51179': 0.009195,
  // Alexandria city: $1.11
  '51510': 0.0111,
  // Fairfax city: $1.075
  '51600': 0.01075,
  // Falls Church city: $1.355
  '51610': 0.01355,
  // Manassas city: $1.19
  '51683': 0.0119,
  // Manassas Park city: $1.185
  '51685': 0.01185,
};
