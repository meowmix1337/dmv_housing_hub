/* global React */
/* DMV Housing — county-level mock data (Montgomery County exemplar + neighbors) */

// Generate FHFA HPI-style annual series, 1975 → 2026
// Anchors: 1985 ~50, 1990 ~70, 1995 ~75, 2000 100, 2007 ~220, 2010 ~150,
// 2015 ~170, 2019 ~190, 2022 ~250, 2024 ~265, 2026 ~270
function genHPI(opts = {}) {
  const { peakDrop = 0.20, latestIdx = 270, scale = 1 } = opts;
  // raw curve normalized to 2000 = 100
  const anchors = {
    1975: 32, 1980: 42, 1985: 50, 1990: 70, 1995: 75, 2000: 100,
    2003: 145, 2005: 185, 2007: 220, 2009: 220 * (1 - peakDrop),
    2011: 220 * (1 - peakDrop) * 0.96, 2013: 160, 2015: 170, 2017: 180,
    2019: 190, 2020: 198, 2021: 230, 2022: 250, 2023: 255, 2024: 265,
    2025: 268, 2026: latestIdx,
  };
  const years = Object.keys(anchors).map(Number).sort((a, b) => a - b);
  const out = [];
  for (let y = 1975; y <= 2026; y++) {
    let v;
    if (anchors[y] != null) v = anchors[y];
    else {
      // linear interpolate
      let lo = years[0], hi = years[years.length - 1];
      for (let i = 0; i < years.length - 1; i++) {
        if (years[i] <= y && y <= years[i + 1]) { lo = years[i]; hi = years[i + 1]; break; }
      }
      const t = (y - lo) / (hi - lo);
      v = anchors[lo] + (anchors[hi] - anchors[lo]) * t;
    }
    out.push({ date: `${y}-12-01`, year: y, value: +(v * scale).toFixed(1) });
  }
  return out;
}

// Generate ZHVI-style monthly series, 1996-01 → 2026-04
function genZHVI(currentValue, yoy, opts = {}) {
  const { peakDrop = 0.15 } = opts;
  const months = [];
  const start = new Date(1996, 0, 1);
  const end = new Date(2026, 3, 1);
  // Build anchor values (current = currentValue), peak in 2022-06,
  // post-crash trough 2011-03, 2000 ~ 0.36 of current, 1996 ~ 0.30 of current
  const peak = currentValue * 1.05;
  const trough = peak * (1 - peakDrop);
  const anchors = [
    { date: new Date(1996, 0, 1),  v: currentValue * 0.28 },
    { date: new Date(2000, 0, 1),  v: currentValue * 0.36 },
    { date: new Date(2003, 0, 1),  v: currentValue * 0.55 },
    { date: new Date(2006, 5, 1),  v: currentValue * 0.85 },
    { date: new Date(2007, 5, 1),  v: currentValue * 0.92 },
    { date: new Date(2009, 0, 1),  v: trough * 1.05 },
    { date: new Date(2011, 2, 1),  v: trough },
    { date: new Date(2013, 0, 1),  v: trough * 1.10 },
    { date: new Date(2016, 0, 1),  v: currentValue * 0.72 },
    { date: new Date(2019, 0, 1),  v: currentValue * 0.82 },
    { date: new Date(2020, 5, 1),  v: currentValue * 0.84 },
    { date: new Date(2022, 5, 1),  v: peak },
    { date: new Date(2023, 0, 1),  v: peak * 0.96 },
    { date: new Date(2024, 0, 1),  v: currentValue / (1 + yoy) },
    { date: new Date(2025, 4, 1),  v: currentValue * (1 + yoy * 0.5) / (1 + yoy) },
    { date: new Date(2026, 3, 1),  v: currentValue },
  ];
  // monthly interpolation
  let d = new Date(start);
  while (d <= end) {
    let lo = anchors[0], hi = anchors[anchors.length - 1];
    for (let i = 0; i < anchors.length - 1; i++) {
      if (anchors[i].date <= d && d <= anchors[i + 1].date) { lo = anchors[i]; hi = anchors[i + 1]; break; }
    }
    const t = (d - lo.date) / (hi.date - lo.date || 1);
    const v = lo.v + (hi.v - lo.v) * t;
    months.push({ date: d.toISOString().slice(0, 10), value: Math.round(v) });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return months;
}

// Federal employment series for a county (last 36 months, % of total jobs)
function genFedSeries(currentPct, peakPct) {
  const out = [];
  const start = new Date(2023, 4, 1);
  for (let i = 0; i < 36; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    let pct;
    if (i < 18) pct = peakPct + Math.sin(i / 4) * 0.002;
    else if (i < 24) pct = peakPct - (i - 18) * 0.0015;
    else pct = peakPct - 0.009 - (i - 24) * 0.0008;
    out.push({ date: d.toISOString().slice(0, 10), value: +Math.max(currentPct, pct).toFixed(4) });
  }
  out[out.length - 1].value = currentPct;
  return out;
}

// Build county detail dataset for ALL counties (only Montgomery and a handful
// of neighbors get rich series; the rest get summary-only for the map/back nav)
const COUNTY_DETAIL = {};

window.COUNTIES.forEach(c => {
  // exurban counties get a sharper crash; close-in milder
  const exurban = ["24009","24017","24021","51177","51179","51153","51683","51685","24003","24033"].includes(c.fips);
  const close = ["11001","51013","51059","51610","51600","51510","24031","24027"].includes(c.fips);
  const peakDrop = exurban ? 0.32 : (close ? 0.12 : 0.20);

  COUNTY_DETAIL[c.fips] = {
    ...c,
    population: ({
      "11001": 678972, "24031": 1062061, "24033": 967201, "24027": 332317,
      "24003": 590336, "24021": 285902, "24017": 175565, "24009": 96580,
      "24005": 849733, "24510": 569931, "51059": 1153822, "51013": 235764,
      "51107": 433916, "51153": 488606, "51177": 144974, "51179": 167382,
      "51510": 159200, "51600": 24373, "51610": 14897, "51683": 42735, "51685": 18139,
    })[c.fips] || 100000,
    propertyTaxRate: ({
      "11001": 0.0085, "24031": 0.0094, "24033": 0.0100, "24027": 0.0124,
      "24003": 0.0093, "24021": 0.0107, "24017": 0.0125, "24009": 0.0094,
      "24005": 0.0110, "24510": 0.0197, "51059": 0.0114, "51013": 0.0103,
      "51107": 0.0098, "51153": 0.0114, "51177": 0.0083, "51179": 0.0095,
      "51510": 0.0111, "51600": 0.0103, "51610": 0.0123, "51683": 0.0125, "51685": 0.0125,
    })[c.fips] || 0.0100,
    series: {
      fhfaHpi: genHPI({ peakDrop, latestIdx: 268 + (c.zhviYoY * 100) }),
      zhvi: genZHVI(c.zhvi, c.zhviYoY, { peakDrop }),
    },
    federal: {
      pctOfJobs: c.fedExposure,
      series: genFedSeries(c.fedExposure, c.fedExposure + 0.02),
    },
    forecasts: [
      { source: "Bright MLS", value: c.medianSalePrice * (1 + (c.zhviYoY - 0.018)), changePct: c.zhviYoY - 0.018 },
      { source: "Zillow",     value: c.zhvi * (1 + c.zhviYoY * 0.4),                changePct: c.zhviYoY * 0.4 },
      { source: "NAR",        value: c.medianSalePrice * 1.027,                     changePct: 0.027 },
    ],
    healthBreakdown: {
      monthsSupply:    { value: c.monthsSupply,                  weight: 30, score: Math.max(0, Math.min(100, 100 - (c.monthsSupply - 1) * 18)) },
      saleToList:      { value: 0.985 + (1 - c.affordability) * 0.04, weight: 25, score: Math.max(0, Math.min(100, 60 + (1 - c.zhviYoY * 5) * 20)) },
      pctSoldAboveList:{ value: Math.max(0.05, 0.55 - c.monthsSupply * 0.08),     weight: 20, score: Math.max(0, Math.min(100, 100 - c.monthsSupply * 14)) },
      inventoryYoY:    { value: 0.45 + c.zhviYoY * (-2),         weight: 25, score: Math.max(0, Math.min(100, 70 - c.monthsSupply * 8)) },
    },
    summary: ({
      "24031": "NIH and FDA anchor a large, diverse federal-adjacent county. Holding steady through the 2025 federal contraction with modest 0.5% YoY growth, supported by high-income workforce resilience.",
      "11001": "The District is bearing the brunt of the 2025 federal layoffs. Listings are at their highest level since 2022 and ZHVI is the only major DMV jurisdiction in clearly negative YoY territory.",
      "51107": "Loudoun is now the highest-income county in the United States. Data center taxes have lowered residential rates while tech salaries support continued ZHVI growth.",
      "24027": "The tightest market in the metro at 1.1 months of supply. Chronic supply shortage and APL/JHU employment keep buyers competing.",
    })[c.fips] || `One of 21 jurisdictions tracked. Current ZHVI ${window.fmtMoney(c.zhvi)} (${window.fmtPct(c.zhviYoY, { signed: true })} YoY).`,
  };
});

window.COUNTY_DETAIL = COUNTY_DETAIL;
