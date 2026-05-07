/* DMV Housing — shared mock data */

window.COUNTIES = [
  { fips: "11001", name: "District of Columbia", shortName: "DC", jurisdiction: "DC", zhvi: 618651, zhviYoY: -0.042, medianSalePrice: 681000, daysOnMarket: 60, monthsSupply: 6.0, marketHealth: 38, affordability: 0.41, income: 101027, fedExposure: 0.27 },
  { fips: "24031", name: "Montgomery County", shortName: "Montgomery", jurisdiction: "MD", zhvi: 594302, zhviYoY: 0.005, medianSalePrice: 650000, daysOnMarket: 33, monthsSupply: 2.4, marketHealth: 68, affordability: 0.34, income: 125583, fedExposure: 0.18 },
  { fips: "24033", name: "Prince George's County", shortName: "Prince George's", jurisdiction: "MD", zhvi: 414871, zhviYoY: 0.007, medianSalePrice: 440000, daysOnMarket: 67, monthsSupply: 3.1, marketHealth: 54, affordability: 0.32, income: 90901, fedExposure: 0.16 },
  { fips: "24027", name: "Howard County", shortName: "Howard", jurisdiction: "MD", zhvi: 640000, zhviYoY: 0.025, medianSalePrice: 565000, daysOnMarket: 26, monthsSupply: 1.1, marketHealth: 81, affordability: 0.30, income: 144927, fedExposure: 0.14 },
  { fips: "24003", name: "Anne Arundel County", shortName: "Anne Arundel", jurisdiction: "MD", zhvi: 540000, zhviYoY: 0.018, medianSalePrice: 548000, daysOnMarket: 25, monthsSupply: 1.8, marketHealth: 74, affordability: 0.31, income: 110803, fedExposure: 0.21 },
  { fips: "24021", name: "Frederick County", shortName: "Frederick", jurisdiction: "MD", zhvi: 500000, zhviYoY: 0.032, medianSalePrice: 505000, daysOnMarket: 28, monthsSupply: 2.0, marketHealth: 71, affordability: 0.32, income: 109709, fedExposure: 0.13 },
  { fips: "24017", name: "Charles County", shortName: "Charles", jurisdiction: "MD", zhvi: 435000, zhviYoY: 0.002, medianSalePrice: 435000, daysOnMarket: 38, monthsSupply: 2.8, marketHealth: 56, affordability: 0.33, income: 105869, fedExposure: 0.24 },
  { fips: "24009", name: "Calvert County", shortName: "Calvert", jurisdiction: "MD", zhvi: 475000, zhviYoY: -0.015, medianSalePrice: 475000, daysOnMarket: 45, monthsSupply: 4.2, marketHealth: 42, affordability: 0.34, income: 116185, fedExposure: 0.28 },
  { fips: "24005", name: "Baltimore County", shortName: "Baltimore Co.", jurisdiction: "MD", zhvi: 363263, zhviYoY: 0.023, medianSalePrice: 360000, daysOnMarket: 32, monthsSupply: 2.9, marketHealth: 65, affordability: 0.30, income: 89262, fedExposure: 0.10 },
  { fips: "24510", name: "Baltimore city", shortName: "Baltimore City", jurisdiction: "MD", zhvi: 185000, zhviYoY: 0.067, medianSalePrice: 240000, daysOnMarket: 60, monthsSupply: 1.7, marketHealth: 60, affordability: 0.28, income: 58349, fedExposure: 0.08 },
  { fips: "51059", name: "Fairfax County", shortName: "Fairfax", jurisdiction: "VA", zhvi: 696057, zhviYoY: 0.004, medianSalePrice: 745000, daysOnMarket: 28, monthsSupply: 1.6, marketHealth: 76, affordability: 0.33, income: 134517, fedExposure: 0.19 },
  { fips: "51013", name: "Arlington County", shortName: "Arlington", jurisdiction: "VA", zhvi: 758859, zhviYoY: -0.007, medianSalePrice: 815000, daysOnMarket: 31, monthsSupply: 2.1, marketHealth: 72, affordability: 0.36, income: 137130, fedExposure: 0.22 },
  { fips: "51107", name: "Loudoun County", shortName: "Loudoun", jurisdiction: "VA", zhvi: 720000, zhviYoY: 0.030, medianSalePrice: 774000, daysOnMarket: 23, monthsSupply: 1.9, marketHealth: 82, affordability: 0.29, income: 170463, fedExposure: 0.11 },
  { fips: "51153", name: "Prince William County", shortName: "Prince William", jurisdiction: "VA", zhvi: 555000, zhviYoY: 0.012, medianSalePrice: 575000, daysOnMarket: 30, monthsSupply: 2.3, marketHealth: 70, affordability: 0.31, income: 117310, fedExposure: 0.17 },
  { fips: "51177", name: "Spotsylvania County", shortName: "Spotsylvania", jurisdiction: "VA", zhvi: 410000, zhviYoY: -0.028, medianSalePrice: 435000, daysOnMarket: 50, monthsSupply: 4.5, marketHealth: 38, affordability: 0.33, income: 96100, fedExposure: 0.26 },
  { fips: "51179", name: "Stafford County", shortName: "Stafford", jurisdiction: "VA", zhvi: 510000, zhviYoY: -0.005, medianSalePrice: 525000, daysOnMarket: 35, monthsSupply: 3.0, marketHealth: 55, affordability: 0.32, income: 119700, fedExposure: 0.23 },
  { fips: "51510", name: "Alexandria city", shortName: "Alexandria", jurisdiction: "VA", zhvi: 672619, zhviYoY: 0.023, medianSalePrice: 485000, daysOnMarket: 51, monthsSupply: 3.5, marketHealth: 60, affordability: 0.36, income: 109118, fedExposure: 0.21 },
  { fips: "51600", name: "Fairfax city", shortName: "Fairfax City", jurisdiction: "VA", zhvi: 792718, zhviYoY: 0.028, medianSalePrice: 702000, daysOnMarket: 25, monthsSupply: 1.7, marketHealth: 78, affordability: 0.34, income: 135270, fedExposure: 0.18 },
  { fips: "51610", name: "Falls Church city", shortName: "Falls Church", jurisdiction: "VA", zhvi: 920000, zhviYoY: 0.058, medianSalePrice: 940000, daysOnMarket: 22, monthsSupply: 1.4, marketHealth: 84, affordability: 0.32, income: 159000, fedExposure: 0.20 },
  { fips: "51683", name: "Manassas city", shortName: "Manassas", jurisdiction: "VA", zhvi: 475000, zhviYoY: 0.008, medianSalePrice: 485000, daysOnMarket: 28, monthsSupply: 2.0, marketHealth: 67, affordability: 0.31, income: 89690, fedExposure: 0.13 },
  { fips: "51685", name: "Manassas Park city", shortName: "Manassas Park", jurisdiction: "VA", zhvi: 445000, zhviYoY: 0.010, medianSalePrice: 455000, daysOnMarket: 30, monthsSupply: 2.2, marketHealth: 64, affordability: 0.31, income: 100200, fedExposure: 0.15 },
];

window.METRO = {
  medianSalePrice: 623140,
  medianSalePriceYoY: -0.010,
  mortgageRate: 0.0623,
  mortgageRateYoY: -0.0058,
  activeListings: 13500,
  activeListingsYoY: 0.95,
  marketHealth: 62,
  daysOnMarket: 34,
  lastUpdated: "April 23, 2026",
};

// Federal employment series (last 36 months, indexed)
window.FED_EMPLOYMENT = (() => {
  const out = [];
  const start = new Date(2023, 4, 1);
  for (let i = 0; i < 36; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    let v;
    if (i < 18) v = 380 + Math.sin(i / 4) * 2;            // stable ~380K
    else if (i < 24) v = 380 - (i - 18) * 1.5;             // gentle decline
    else v = 371 - (i - 24) * 4.2;                          // sharp 2025 decline
    out.push({ date: d.toISOString().slice(0, 10), value: Math.round(v * 1000) });
  }
  return out;
})();

// 30-year mortgage rate series, last 24 months
window.MORTGAGE_RATES = (() => {
  const out = [];
  const start = new Date(2024, 4, 1);
  const path = [6.95, 7.05, 7.15, 7.20, 7.05, 6.85, 6.72, 6.81, 6.95, 7.04, 6.92, 6.78, 6.65, 6.58, 6.62, 6.71, 6.55, 6.42, 6.35, 6.28, 6.31, 6.25, 6.20, 6.23];
  for (let i = 0; i < 24; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    out.push({ date: d.toISOString().slice(0, 10), value: path[i] });
  }
  return out;
})();

// Active listings series, last 36 months
window.LISTINGS = (() => {
  const out = [];
  const start = new Date(2023, 4, 1);
  const path = [
    7200, 7400, 7100, 6900, 6800, 6700, 6500, 6400, 6300, 6500, 6900, 7200,
    7600, 7900, 8100, 8000, 7800, 7600, 7700, 8000, 8400, 9000, 9800, 10600,
    11200, 11800, 12200, 12600, 12900, 13100, 13200, 13300, 13350, 13420, 13480, 13500,
  ];
  for (let i = 0; i < 36; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    out.push({ date: d.toISOString().slice(0, 10), value: path[i] });
  }
  return out;
})();

window.fmtMoney = (n, opts = {}) => {
  if (n == null) return "—";
  if (opts.compact && Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (opts.compact && Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return "$" + Math.round(n).toLocaleString("en-US");
};
window.fmtPct = (r, opts = {}) => {
  if (r == null) return "—";
  const v = r * 100;
  const sign = opts.signed && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(opts.digits ?? 1)}%`;
};
window.fmtInt = (n) => n == null ? "—" : Math.round(n).toLocaleString("en-US");

window.healthColor = (s) => {
  if (s == null) return "var(--fg-3)";
  if (s < 36) return "#dc2626";
  if (s < 56) return "#d97706";
  if (s < 76) return "#1d4ed8";
  return "#059669";
};
window.dirColor = (n) => {
  if (n == null || Math.abs(n) < 0.001) return "var(--fg-3)";
  return n > 0 ? "#059669" : "#dc2626";
};
window.juriColor = (j) => ({ DC: "#dc2626", MD: "#ca8a04", VA: "#1d4ed8" }[j]);
window.juriBgFg = (j) => ({
  DC: { bg: "#fee2e2", fg: "#991b1b" },
  MD: { bg: "#fef3c7", fg: "#854d0e" },
  VA: { bg: "#dbeafe", fg: "#1e40af" },
}[j]);
