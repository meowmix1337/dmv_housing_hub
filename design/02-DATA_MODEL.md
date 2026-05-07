# Data Model

These are the data shapes the UI consumes. Use these field names in your mock data so designs can drop into the real codebase without rewriting.

## CountySummary — the per-county data object

This is what the `/county/:fips` page receives. One JSON file per county.

```ts
interface CountySummary {
  fips: string;                  // 5-digit FIPS, e.g. "24031"
  name: string;                  // "Montgomery County"
  jurisdiction: 'DC' | 'MD' | 'VA';
  population?: number;
  medianHouseholdIncome?: number; // USD, annual
  lastUpdated: string;            // ISO timestamp

  current: {
    medianSalePrice?: number;     // USD
    medianSalePriceYoY?: number;  // ratio, e.g. 0.025 = +2.5%
    zhvi?: number;                // Zillow typical home value, USD
    zhviYoY?: number;             // ratio
    daysOnMarket?: number;        // integer
    monthsSupply?: number;        // decimal, ~1-6 typical
    saleToListRatio?: number;     // 0.97-1.05 typical
    pctSoldAboveList?: number;    // ratio, 0-1
    unemploymentRate?: number;    // ratio, 0-1
    marketHealthScore?: number;   // 0-100, derived
    affordabilityIndex?: number;  // 0-1, monthly cost / monthly income
  };

  series: {
    fhfaHpi?: MetricPoint[];       // FHFA House Price Index, annual back to ~1975
    zhvi?: MetricPoint[];           // Zillow ZHVI, monthly back to ~1996
    medianSalePrice?: MetricPoint[]; // Redfin, monthly
    daysOnMarket?: MetricPoint[];    // monthly
    activeListings?: MetricPoint[];  // monthly
  };

  forecasts?: CountyForecast[];
}

interface MetricPoint {
  date: string;   // ISO date, e.g. "2025-12-01"
  value: number;
}

interface CountyForecast {
  source: string;            // "Bright MLS" | "Zillow" | "NAR"
  metric: string;            // "median_sale_price" | "zhvi_all_homes"
  horizonMonths: number;     // e.g. 12
  forecastValue: number;
  forecastChangePct: number; // ratio
  publishedAt: string;
}
```

## Realistic mock values

Use these so the designs feel like the real product. Round numbers as you see fit.

### Hero metrics for the DMV metro (Home page)

- DMV median sale price: **$623,140** (-1.0% YoY forecast for 2026)
- 30-year fixed mortgage rate: **6.23%** (down from 6.81% a year ago)
- DMV active listings: **~13,500** (roughly 2× a year ago)
- DMV market health score: **62 / 100** (neutral, normalizing)
- DMV days on market: **34** (median)

### Per-county current snapshots (use these for mocks)

| County | ZHVI | YoY | Median Sale | DOM | Months Supply | Health |
|---|---|---|---|---|---|---|
| Washington, DC (11001) | $618,651 | -4.2% | $681,000 | 60 | 6.0 | 38 |
| Montgomery County, MD (24031) | $594,302 | +0.5% | $650,000 | 33 | 2.4 | 68 |
| Prince George's County, MD (24033) | $414,871 | +0.7% | $440,000 | 67 | 3.1 | 54 |
| Howard County, MD (24027) | $640,000 | +2.5% | $565,000 | 26 | 1.1 | 81 |
| Anne Arundel County, MD (24003) | $540,000 | +1.8% | $548,000 | 25 | 1.8 | 74 |
| Frederick County, MD (24021) | $500,000 | +3.2% | $505,000 | 28 | 2.0 | 71 |
| Charles County, MD (24017) | $435,000 | +0.2% | $435,000 | 38 | 2.8 | 56 |
| Calvert County, MD (24009) | $475,000 | -1.5% | $475,000 | 45 | 4.2 | 42 |
| Baltimore County, MD (24005) | $363,263 | +2.3% | $360,000 | 32 | 2.9 | 65 |
| Baltimore City, MD (24510) | $185,000 | +6.7% | $240,000 | 60 | 1.7 | 60 |
| Fairfax County, VA (51059) | $696,057 | +0.4% | $745,000 | 28 | 1.6 | 76 |
| Arlington County, VA (51013) | $758,859 | -0.7% | $815,000 | 31 | 2.1 | 72 |
| Loudoun County, VA (51107) | $720,000 | +3.0% | $774,000 | 23 | 1.9 | 82 |
| Prince William County, VA (51153) | $555,000 | +1.2% | $575,000 | 30 | 2.3 | 70 |
| Spotsylvania County, VA (51177) | $410,000 | -2.8% | $435,000 | 50 | 4.5 | 38 |
| Stafford County, VA (51179) | $510,000 | -0.5% | $525,000 | 35 | 3.0 | 55 |
| Alexandria City, VA (51510) | $672,619 | +2.3% | $485,000 | 51 | 3.5 | 60 |
| Fairfax City, VA (51600) | $792,718 | +2.8% | $702,000 | 25 | 1.7 | 78 |
| Falls Church City, VA (51610) | $920,000 | +5.8% | $940,000 | 22 | 1.4 | 84 |
| Manassas City, VA (51683) | $475,000 | +0.8% | $485,000 | 28 | 2.0 | 67 |
| Manassas Park City, VA (51685) | $445,000 | +1.0% | $455,000 | 30 | 2.2 | 64 |

### Realistic FHFA HPI history shape

Index 100 in 2000. Use these anchor points and interpolate smoothly:

- 1985: ~50
- 1990: ~70
- 1995: ~75
- 2000: 100
- 2005: ~200 (bubble peak in 2007 ~220 for outer suburbs, ~180 for close-in)
- 2010: ~150 (post-crash)
- 2015: ~170
- 2019: ~190
- 2022: ~250 (COVID peak)
- 2024: ~265
- 2026: ~270

For exurban counties (Spotsylvania, Calvert, Charles), the 2007–2011 drop is sharper (-30 to -40%); for close-in (Arlington, DC, Montgomery) it's milder (-10 to -15%).

### Forecast cone for 2026 (use on County page)

For Montgomery County 2026 forecast:
- Bright MLS: $645,000 (-0.8%)
- Zillow: $590,000 (-0.7% from current $594K)
- NAR: $668,000 (+2.7%)

The spread is the point. Show all three.

## Metric units / formatting

- **USD currency**: `$650,000` (no cents)
- **Large USD**: `$1.2M` for >$1M when space-constrained
- **Percentages**: `+2.5%` with sign for changes; `2.5%` without sign for levels (rates)
- **Ratios as %**: `97.8%` for sale-to-list ratio
- **Dates**: `Apr 2026` short, `April 23, 2026` long
- **Days**: `33 days`
- **Counts**: `13,500` with thousands separator

## Color encodings (consistent across pages)

- **Direction up (good for sellers)**: emerald-600 `#059669`
- **Direction down (good for buyers, bad for sellers)**: red-600 `#dc2626`
- **Direction neutral / flat**: neutral-500 `#737373`
- **DC jurisdiction**: red `#dc2626`
- **MD jurisdiction**: amber `#ca8a04`
- **VA jurisdiction**: blue `#1d4ed8`

When showing a change number, color the number itself, not just an icon. Negative price change = red text. Positive = green text. This applies to YoY changes throughout.

For market-health 0–100 score:
- 0–35: red `#dc2626` (concerning)
- 36–55: amber `#d97706` (cooling)
- 56–75: blue `#1d4ed8` (balanced)
- 76–100: emerald `#059669` (tight / strong)

## Source attribution to display

Every chart and metric block should display its source. Examples to use in mocks:

- "Source: U.S. Federal Housing Finance Agency, via FRED"
- "Source: Zillow Research"
- "Source: Redfin Data Center"
- "Source: U.S. Census Bureau, ACS 5-year 2023"
- "Source: Bureau of Labor Statistics"
- "Source: Freddie Mac Primary Mortgage Market Survey"

Display as small (12px), muted (`text-neutral-500`) text below the chart, not in a tooltip.
