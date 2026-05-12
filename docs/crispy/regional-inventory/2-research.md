# Research

Findings are organized to mirror the question groupings in `1-questions.md`. All references to repo paths are relative to the project root.

The DMV scope used by this project is 21 counties / independent cities (`scripts/lib/counties.ts`): 1 DC + 9 MD + 11 VA. Throughout this document "DMV" = those 21 FIPS, not the Washington-Arlington-Alexandria CBSA.

---

## Data sources & coverage

### Q1. County-level for-sale inventory datasets covering DC/MD/VA, and latest month available

Three free, publicly redistributable datasets publish for-sale inventory at the county level for DMV jurisdictions:

1. **Redfin Data Center — `county_market_tracker.tsv000.gz`**
   - Source URL: `https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz`
   - Cadence: weekly (updated Wednesdays for prior week) and monthly (third Friday). Single file contains both `period_duration=7` (weekly) and `period_duration=30` (monthly) rows.
   - Already ingested in this repo (`scripts/ingest/redfin.ts`).

2. **Realtor.com Inventory Core Metrics — published via FRED**
   - Series naming pattern: `ACTLISCOU{FIPS}` for active listings at the county and CBSA levels (e.g. `ACTLISCOU47900` = Washington-Arlington-Alexandria, DC-VA-MD-WV CBSA). Companion series: `NEWLISCOU{FIPS}` (new listings), `TOTLISCOU{FIPS}` (total = active+pending), `MEDDAYONMAR{FIPS}` (median days on market), and MoM/YoY change variants (`...MM{FIPS}`, `...YY{FIPS}`).
   - Cadence: monthly, not seasonally adjusted.
   - Project does have a FRED ingester (`scripts/ingest/fred.ts`) and `FRED_API_KEY` plumbing; existing FRED queries already pull Realtor.com hotness series (`HOSCCOUNTY{FIPS}`, `HORAMMCOUNTY{FIPS}`).
   - Source: `https://fred.stlouisfed.org/release?rid=462`.

3. **Zillow Research — For-Sale Inventory (raw)**
   - Source page: `https://www.zillow.com/research/data/`
   - Cadence: monthly CSV refresh.
   - Geographies: neighborhood, ZIP, city, county, metro, state, national.
   - Definition: "count of unique listings that were active at any time in a given month."
   - Project already ingests Zillow ZHVI/ZORI in `scripts/ingest/zillow.ts`, but does not currently pull the inventory file.

**Latest month** is read from `web/public/data/manifest.json` at runtime (the project manifest is the source of truth for "what's published right now"). At the point this research was written:
- `web/public/data/manifest.json` shows `redfin: 2026-05-09T15:52:00`, `fred: 2026-05-09T15:51:07`, `zillow: 2026-05-09T15:51:14`.
- Latest `series.activeListings` date in `web/public/data/counties/*.json` (Redfin): `2026-03-31`.
- Latest `ACTLISCOU{FIPS}` observation from FRED API probe: `2026-04-01` (one month newer than what Redfin currently exposes).

### Q2. Metrics each dataset exposes and definitions

**Redfin (`county_market_tracker.tsv`)** — columns mapped in `scripts/ingest/redfin.ts`:

| Column | `MetricId` in repo | Unit |
|---|---|---|
| `MEDIAN_SALE_PRICE` | `median_sale_price` | USD |
| `MEDIAN_LIST_PRICE` | `median_list_price` | USD |
| `MEDIAN_PPSF` | `median_price_per_sqft` | USD/sqft |
| `HOMES_SOLD` | `homes_sold` | count |
| `NEW_LISTINGS` | `new_listings` | count |
| `INVENTORY` | `active_listings` | count |
| `MONTHS_OF_SUPPLY` | `months_supply` | months |
| `MEDIAN_DOM` | `days_on_market` | days |
| `AVG_SALE_TO_LIST` | `sale_to_list_ratio` | ratio |
| `SOLD_ABOVE_LIST` | `pct_sold_above_list` | percent |
| `PRICE_DROPS` | `pct_price_drops` | percent |

Other columns present in the file but not currently mapped: `pending_sales`, `off_market_in_two_weeks`, `is_seasonally_adjusted` (flag).

Redfin metric definitions (verified from `https://www.redfin.com/news/data-center-metrics-definitions/`):
- **Inventory**: "the total number of active listings on the market on the last day of a given time period." (point-in-time end-of-period count.)
- **Active listings**: "the total number of listings of homes for sale that were active at any point during a given time period." (period-cumulative count.)
- The Redfin TSV column name is `INVENTORY`; the repo aliases it to `MetricId='active_listings'`. The two terms refer to different definitions per Redfin's own glossary, so this naming is technically lossy — the project's `active_listings` field is actually Redfin's "inventory" definition (end-of-period stock).

**Realtor.com (FRED) — Housing Inventory Core Metrics release** (release id 462):
- `ACTLISCOU{FIPS}`: "count of active single-family and condo/townhome listings for the market during the specified month (excludes pending listings)."
- `NEWLISCOU{FIPS}`: count of new listings entering the market during the month.
- `TOTLISCOU{FIPS}`: count of all listings (active + pending).
- `MEDDAYONMAR{FIPS}`: median days a listing was active before going off-market.
- Methodology note: data released since December 2021 uses an updated mapping of listing statuses and "is not directly comparable" to earlier releases. All future releases including historical revisions apply the new methodology.

**Zillow Research**:
- For-Sale Inventory: "count of unique listings that were active at any time in a given month." CSV provides time series at multiple geography levels.

### Q3. Historical depth and publishing cadence

| Source | Earliest county data | Cadence | Typical lag |
|---|---|---|---|
| Redfin county_market_tracker | 2012-01-31 (verified — that is the earliest `activeListings` date in `web/public/data/counties/11001.json`; ingester carries 171 monthly snapshots through 2026-03 for each of 19 reporting counties) | weekly + monthly | ~1 week (weekly), monthly file on third Friday |
| Realtor.com via FRED | 2016-07-01 (verified across all 17 covered DMV FIPS via FRED API: every series shows `observation_start=2016-07-01`) | monthly | ~1 month (latest observation as of 2026-05-09 was 2026-04-01) |
| Zillow For-Sale Inventory | not verified — Zillow's general-purpose statement that "many series include data as far back as the late 1990s" applies to research data overall, not specifically inventory at the county level. The Zillow developer page does not state a start date for inventory specifically. | monthly | not verified |

A reasonable starting assumption for the prototype design is **2018-01** for Zillow inventory (matches when most Zillow inventory CSVs began publication based on community references) but this needs to be confirmed by attempting an ingest. Given the existing Redfin and Realtor.com series both go back further and are already integrated, Zillow inventory is unlikely to be the primary historical source.

### Q4. Coverage gaps in DMV counties

**Redfin county_market_tracker** — empirically verified from `scripts/.cache/redfin.json` and per-county output:
- 19 of 21 DMV FIPS have `active_listings` data (171 monthly observations each, 2012-01 → 2026-03).
- **Missing entirely**: Baltimore city `24510`, Fairfax city `51600` (no rows in cache for these FIPS).
- Two outliers in repo data show suspect values that suggest data-quality issues with the dedup or property-type mapping rather than real coverage gaps:
  - Montgomery County `24031` latest = `153` (per-county MoM σ ≈ 1264% — almost certainly a unit/dedup bug, not real listings).
  - Frederick County `24021` latest = `624` with MoM σ ≈ 56% (high but plausible if mixed property-type rows survive dedup).
- Reason these gaps exist: the build-county-pages dedup at `scripts/transform/build-county-pages.ts:86-101` keys on `(source, fips, metric, observedAt)`, sorting `all_residential` first. Per the Redfin name-matching logic at `scripts/ingest/redfin.ts:51-55`, Baltimore city likely fails the FIPS-index lookup if it appears in the TSV without the " city" suffix and is not handled.

**Realtor.com (FRED `ACTLISCOU{FIPS}`)** — empirically verified by FRED API probe:
- 17 of 21 DMV FIPS have a series.
- **Missing**: Fairfax city `51600`, Falls Church city `51610`, Manassas city `51683`, Manassas Park city `51685` (FRED API returns HTTP 400 for these). All four are small VA independent cities. Realtor.com's data partner appears not to publish for sub-CBSA jurisdictions of this size.

**Union of available coverage**:
- Both sources cover: 11001, 24003, 24005, 24009, 24017, 24021, 24027, 24031, 24033, 51013, 51059, 51107, 51153, 51177, 51179, 51510 (16 FIPS).
- Redfin only: 51610, 51683, 51685.
- FRED Realtor only: 24510 (Baltimore city).
- **Neither source has 51600 (Fairfax city)**. This is a hard coverage gap regardless of which dataset is used.

**Suppression rules**:
- Redfin: not officially documented. Inspection of `https://www.redfin.com/news/data-center-metrics-definitions/` confirms the page does not describe data suppression rules. Empirically, Redfin's TSV omits rows or fields when the (region, property_type, period) combination has no qualifying transactions/listings; there is no published threshold.
- Realtor.com (FRED): no formal suppression policy disclosed. Series simply do not exist for jurisdictions Realtor.com chooses not to publish (the four small VA cities above). Within published series, individual months may carry the FRED missing-value sentinel `"."`.
- Zillow: not verified.

### Q5. Licensing / attribution requirements

- **Redfin**: "Data is available for your own purposes with the request that you cite the source and include proper citation and link to Redfin for the first reference on a page, post, or article." (`DATA_SOURCES.md:215` notes this requirement.)
- **Realtor.com (via FRED)**: distributed under FRED's standard terms (free use with attribution to the original source; FRED is not a redistribution barrier). Realtor.com's underlying raw research data is not publicly redistributable for non-FRED endpoints — Realtor.com is a consumer site without a data-vendor license, but the FRED-published series can be cited as "Realtor.com via FRED" without further action.
- **Zillow Research**: per Zillow's terms of use, "Proper and clear attribution of all data to Zillow is required. … you may display and distribute derivative works of the Aggregate Data (e.g., within a graph), only so long as the Zillow Companies are cited as a source on every page where the Aggregate Data are displayed, including 'Data Provided by Zillow Group.'" Citations may not include logos without prior written approval. Existing project usage of Zillow ZHVI/ZORI must already comply with this.

---

## Existing project state

### Q6. Where county-level active listings are captured today

- **Ingester**: `scripts/ingest/redfin.ts`, COLUMN_MAP at lines 22–34: `INVENTORY: { metric: 'active_listings', unit: 'count' }`. Source identifier: `source: 'redfin'`. Series identifier pattern: `redfin:county:{property_type_slug}` where slugs are `all_residential | single_family | condo | townhouse | multi_family` (`PROPERTY_TYPE_SLUGS` at lines 36–42).
- **Cache file**: `scripts/.cache/redfin.json` (~34 MiB, 160,436 observations across all 11 mapped metrics).
- **Series breakdown** in cache: `redfin:county:all_residential` 39,353 rows; `single_family` 39,328; `townhouse` 38,744; `condo` 34,426; `multi_family` 8,585.
- **Period filter**: only rows where `PERIOD_DURATION` is 7 or 30 are kept (`scripts/ingest/redfin.ts:62-63`).
- **`MetricId`**: `'active_listings'` defined in `shared/src/types.ts:24`.

### Q7. CountySummary inventory shape and consumers

`shared/src/types.ts` defines:

```ts
export interface CountySeries {
  fhfaHpi?: MetricPoint[];
  zhvi?: MetricPoint[];
  medianSalePrice?: MetricPoint[];
  daysOnMarket?: MetricPoint[];
  activeListings?: MetricPoint[];
  federalEmployment?: MetricPoint[];
}
```

`CountyCurrentSnapshot` does not include an `activeListings` scalar today — there is no current-month or YoY scalar persisted per county for active listings.

The transform (`scripts/transform/build-county-pages.ts:152, 167`) filters Redfin observations by `metric === 'active_listings'`, sorts by date, and writes them to `series.activeListings`. Sample county output (`web/public/data/counties/11001.json`) confirms the field is populated from `2012-01-31` onward.

Consumers of `series.activeListings`:
- `web/src/lib/metro.ts:30-34, 54` — sum of last point across all counties → `MetroSnapshot.activeListings`.
- No County page chart currently consumes it (grep on `web/src/pages/County.tsx` returned no inventory references).

### Q8. "Regional inventory chart coming soon" placeholder location

`web/src/components/home/WhatsDriving.tsx:138-147`:

```tsx
<Card padding="none" className="p-6 flex flex-col gap-3.5">
  <div className="eyebrow text-fg-3">Active inventory</div>
  <h3 className="font-display text-[22px] font-semibold tracking-tight leading-snug">
    Regional inventory chart coming soon
  </h3>
  <p className="text-sm text-fg-2 leading-snug">
    County-level active listings are tracked. A regional aggregate time series will be
    added in a future update.
  </p>
</Card>
```

The placeholder lives inside the `WhatsDriving` section component, which is rendered on the Home page (`web/src/pages/Home.tsx:67-71`). The "What's driving the market" section header text is at `WhatsDriving.tsx:118-122`: eyebrow "What's driving the market", title "Three forces, pulling in different directions".

### Q9. Other metrics in the market health section and their visual patterns

The "What's driving the market" section currently renders 4 cards in a 2×2 grid (`WhatsDriving.tsx:123`):

1. **Federal employment** — `FedEmploymentChart` (real data). AreaChart with red gradient (`#dc2626`), rendered via `DriverCard` (kicker, title, callout, calloutColor, chart, source). Source line: `BLS QCEW · DMV total · as of {asOf}`.
2. **Mortgage rates** — `MortgageChart` (real data). AreaChart with blue gradient (`#1d4ed8`). 24-month slice. Source line: `Freddie Mac PMMS · 30-year fixed`.
3. **Active inventory** — placeholder (no chart, no data).
4. **County affordability split** — placeholder (no chart, no data).

Common patterns from `DriverCard` (`web/src/components/home/DriverCard.tsx`): `kicker`, `title`, `callout`, `calloutColor`, `chart`, `source`. Both real charts use:
- Recharts `ResponsiveContainer` with `AreaChart`.
- `<linearGradient>` defs for fill.
- `XAxis` with mono-font tick labels formatted as `'YY` (two-digit year).
- `YAxis` with `domain={['auto','auto']}` and `tickLine={false}`, `axisLine={false}`.
- `<CartesianGrid stroke="#F4EFE5" vertical={false} />`.
- `Tooltip` with `contentStyle={{ fontSize: 12, fontFamily: 'var(--font-mono)', borderRadius: 8, border: '1px solid #E7E2D8' }}`.
- `dot={false}` and `strokeWidth={1.5}`.

A separate `MetricStrip` row (`web/src/components/home/MetricStrip.tsx`) above the section already shows an "Active listings" tile sourced from `MetroSnapshot.activeListings` (sum of latest county values, formatted `~{x}K`). Its YoY change is currently incorrect — `web/src/lib/metro.ts:55` sets `activeListingsYoY: median(salePriceYoYs)` (uses median sale price YoY values rather than active-listings YoY).

### Q10. Existing regional / aggregate time series production

Two regional/aggregate time series are produced today, both inside `scripts/transform/build-county-pages.ts`:

1. **`web/public/data/metrics/mortgage-rates.json`** — pulled directly from FRED at the national (`fips: 'USA'`) level and re-exported. No aggregation; just filter and pass through (`build-county-pages.ts:327-340`).
2. **`web/public/data/metrics/federal-employment-dmv.json`** — aggregated at transform time by summing QCEW `federal_employment` observations across all DMV counties for each quarter (`build-county-pages.ts:354-388`). Crucial detail: the aggregator only emits a quarter when **every** DMV county has reported (`countByDate.get(d) === DMV_COUNTIES.length`), to avoid partial sums.

There is currently no aggregation step for `active_listings`. The home page's `MetroSnapshot.activeListings` sum happens client-side from per-county summaries (latest point only), which means no aggregate time series is materialized to a JSON file.

API loaders for the existing aggregates: `web/src/api.ts:34-53` (`getMortgageRates`, `getFederalEmploymentDmv`).

---

## Aggregation & methodology

### Q11. County-sum vs. published regional totals — empirically verified

For 2026 monthly observations from FRED Realtor.com (sum across the 17 reporting DMV FIPS vs. published CBSA `ACTLISCOU47900`):

| Month | DMV-county sum (n=17) | CBSA 47900 published | Diff (CBSA − sum) |
|---|---|---|---|
| 2026-01-01 | 13,757 | 9,919 | −3,838 |
| 2026-02-01 | 13,533 | 9,872 | −3,661 |
| 2026-03-01 | 15,252 | 11,382 | −3,870 |
| 2026-04-01 | 17,431 | 13,265 | −4,166 |

The CBSA total is consistently **lower** than the DMV-county sum by 25–30%. Reason: the project's DMV scope intentionally includes counties **outside** the Washington-Arlington-Alexandria CBSA — specifically the Baltimore-area counties (Anne Arundel `24003`, Baltimore County `24005`, Baltimore city `24510`) which are part of the Baltimore-Columbia-Towson MSA (`12580`), plus outlying VA counties (Spotsylvania `51177`, Stafford `51179`). Conversely, CBSA 47900 also includes WV counties (Jefferson WV) and additional VA counties not in the project's DMV list.

**Implication**: the published CBSA series is **not** a substitute for a "DMV total" matching the project's scope. Any regional inventory aggregate must be computed by summing across the project's 21 FIPS, not by adopting CBSA 47900.

### Q12. Standard aggregation methodologies for county active-listings counts

For an active-listings count metric (a stock, not a rate), the publicly documented options are:

1. **Simple sum** — add per-county counts. Assumes (a) no double-counting and (b) consistent definition across counties.
2. **Coverage-adjusted simple sum** — only emit a regional value when N counties report; otherwise skip the period. Used by the QCEW federal-employment aggregator in this repo (`build-county-pages.ts:365-369`). Rationale documented in code: avoids partial sums.
3. **Population-weighted regional rate** — typically used for ratios (e.g. months supply, DOM), not raw counts. Not applicable to a count metric.
4. **Per-1,000-housing-units normalization** — divides the count by housing-unit denominator from Census ACS. Provides a stable, comparable rate. Not currently in repo data.

### Q13. Seasonality and seasonally adjusted variants

- **Redfin**: TSV row contains `is_seasonally_adjusted` flag. The current ingester (`scripts/ingest/redfin.ts`) does not parse this column, and `scripts/.cache/redfin.json` does not retain it, so empirical inspection of which DMV rows are SA vs NSA from the cache is not possible. Per Redfin's data-center documentation, all county-level rows are non-seasonally adjusted by default; SA variants are only produced for a subset of metro/national series.
- **Realtor.com (FRED)**: Active Listing Count series at the county/CBSA level are explicitly "not seasonally adjusted" (verified on `ACTLISCOU47900` series metadata).
- **Zillow**: For-Sale Inventory is not seasonally adjusted in the raw research files.

For DMV-wide aggregates, this project will need to either accept seasonal swings (count peaks May–Sep, troughs Nov–Feb) or apply a simple seasonality treatment (e.g. YoY % change, or 12-month moving average). The DMV total series exhibits a clear seasonal pattern in the empirical data below.

### Q14. Volatility and county dominance — empirically computed

Computed from Redfin `series.activeListings` in `web/public/data/counties/*.json` (171 months, 2012-01 → 2026-03), aggregated as a simple sum across the 19 counties that have Redfin data:

**DMV-wide simple-sum total**:
- First (2012-01): 21,238 listings.
- Last (2026-03): 14,307 listings.
- Range over last 24 months: 10,177 (2024-12 trough) to 19,911 (2025-09 peak).
- MoM σ = 11.05%; YoY σ = 18.22%.

**Last 24 monthly totals (Redfin-derived DMV simple sum)**:

```
2024-04: 11,990    2025-04: 17,229
2024-05: 12,645    2025-05: 19,768
2024-06: 13,183    2025-06: 17,625
2024-07: 12,895    2025-07: 17,721
2024-08: 14,082    2025-08: 16,999
2024-09: 15,181    2025-09: 19,911
2024-10: 13,856    2025-10: 18,027
2024-11: 14,154    2025-11: 16,201
2024-12: 10,177    2025-12: 14,220
2025-01: 11,807    2026-01: 14,056
2025-02: 12,766    2025-02: 14,600
2025-03: 15,087    2026-03: 14,307
```

The series is clearly seasonal (peaks in May–Sep, trough in Dec) and currently sits at roughly the same level as a year prior — not "2× a year ago" as the prototype's narrative anchor (`claude_design/uploads/04-DMV_CONTEXT.md:56`) suggested.

**Per-county share of the 2026-04-01 DMV total** (FRED Realtor data; sum n=17 = 17,431):

| FIPS | County | Listings | Share |
|---|---|---|---|
| 11001 | District of Columbia | 2,736 | 15.7% |
| 24510 | Baltimore city | 2,228 | 12.8% |
| 51059 | Fairfax County | 1,937 | 11.1% |
| 24033 | Prince George's | 1,787 | 10.3% |
| 24031 | Montgomery | 1,748 | 10.0% |
| 24005 | Baltimore Co. | 1,224 | 7.0% |
| 24003 | Anne Arundel | 1,105 | 6.3% |
| 51153 | Prince William | 725 | 4.2% |
| 51107 | Loudoun | 677 | 3.9% |
| 24021 | Frederick | 630 | 3.6% |
| 24017 | Charles | 483 | 2.8% |
| 51013 | Arlington | 439 | 2.5% |
| 24027 | Howard | 422 | 2.4% |
| 51179 | Stafford | 395 | 2.3% |
| 51177 | Spotsylvania | 350 | 2.0% |
| 51510 | Alexandria | 310 | 1.8% |
| 24009 | Calvert | 235 | 1.3% |

Top 5 counties account for ~58% of the regional total. The smallest jurisdictions (independent VA cities Falls Church `51610`, Manassas Park `51685`, Manassas `51683`) each contribute well under 1% in absolute terms but are the most volatile (per-county MoM σ in the 16–26% range vs. 6–14% for the large counties). Their contribution to total volatility is therefore small.

**Per-county MoM σ** (Redfin series, full history): Prince George's 5.8% (lowest), Charles 7.0%, Baltimore Co. 7.5%, Anne Arundel 8.0%, DC 9.3%, Spotsylvania 9.0%, Calvert 8.7%, Loudoun 13.2%, Howard 12.2%, Arlington 12.9%, Alexandria 13.9%, Fairfax 14.1%, Stafford 11.4%, Prince William 11.9%, Falls Church 25.5%, Manassas 16.1%, Manassas Park 20.9%. Frederick (55.9%) and Montgomery (1264%) have anomalous values that almost certainly indicate dedup or property-type-mixing bugs in the existing Redfin transform rather than real volatility.

---

## Prototype & design

### Q15. Prototype location and inventory specifications

Prototype lives at `claude_design/` in the repo (a static demo built with `home.jsx`, `data.js`, `county-data.js`, `county.jsx`).

- **Inventory chart component**: `claude_design/home.jsx:346-382` defines `InventoryCard()`, called from the home layout at `claude_design/home.jsx:243` (`<InventoryCard />`).
- **Data shape**: `claude_design/data.js:67-80` defines `window.LISTINGS` as a 36-month series starting `2023-05-01`, values from 7,200 ramping to 13,500 active listings (mock data).
- **Card configuration** (`home.jsx:346-381`):
  - `kicker="Inventory"`
  - `title="Listings have nearly doubled in a year"`
  - `callout="~13,500 active"`
  - `source="Redfin Data Center"`
  - Recharts `AreaChart`, with a `linearGradient` from `#A4243B` at 18% opacity → 0%.
  - X-axis: shows year tick only at January (`dt.getMonth() === 0 ? "'YY" : ""`), `interval={0}`.
  - Y-axis: `(v / 1000).toFixed(0) + "K"`, no axis line, no tick line, width 36.
  - `<CartesianGrid stroke="#F4EFE5" vertical={false} />`.
  - `<Tooltip>` formats value with `v.toLocaleString()` and "Active listings" label; date formatted as "Mon YYYY".
  - `<Area type="monotone" dataKey="value" stroke="#A4243B" strokeWidth={2} fill="url(#inv-grad)" />`.

- **Narrative anchor**: `claude_design/uploads/04-DMV_CONTEXT.md:56` — "Inventory normalizing — chart of metro active listings. Callout: '~2× a year ago, but still below pre-pandemic norms.'"
- **DMV total assumption**: `claude_design/uploads/02-DATA_MODEL.md:66` — "DMV active listings: ~13,500 (roughly 2× a year ago)". Empirically the DMV total now sits around 14,300 (Mar 2026), and is roughly flat YoY rather than 2× — the narrative will need updating.

### Q16. Prototype affordances for regional vs. per-county view

- The prototype only renders inventory at the **regional (metro) level** — there is no per-county inventory chart in `county.jsx`. `claude_design/county.jsx:372` references inventory only as a market-health input ("Inventory YoY"), not as a chart.
- Time range: 36 months (~3 years).
- Comparison: none — single area series, no toggle, no comparison overlay, no time-range selector.

### Q17. Citation and last-updated patterns in the prototype

- The `DriverCard` `source` prop renders source attribution beneath the chart. Inventory card uses `source="Redfin Data Center"`.
- The prototype does not display per-card "last updated" timestamps; it relies on the global hero/footer for freshness.
- Live counterparts in the shipped app use richer source strings:
  - Federal employment: `BLS QCEW · DMV total · as of ${data.asOf}` (`WhatsDriving.tsx:63`) — combines source, scope, and data date.
  - Mortgage: `Freddie Mac PMMS · 30-year fixed` (`WhatsDriving.tsx:110`).
- Redfin's data license (`DATA_SOURCES.md:215`) requires a citation and link to Redfin; the live `MetricStrip` uses `Redfin · latest` for the active listings tile (`MetricStrip.tsx:62`).

---

## Open Questions

- **Q2 (Zillow inventory history depth)**: Zillow's research-data developer page does not publish a start date for For-Sale Inventory at the county level. Empirical confirmation requires downloading the inventory CSV. Given Redfin and Realtor.com both already provide adequate history (2012-01 and 2016-07 respectively), Zillow inventory is unlikely to be the primary historical source and the gap is not blocking.
- **Q4 (Redfin formal suppression rules)**: not officially documented; only empirical behavior is observable. The two missing FIPS in the Redfin cache (Baltimore city `24510`, Fairfax city `51600`) appear to reflect the Redfin name-matching logic in `scripts/ingest/redfin.ts:51-55`, not upstream suppression — Redfin likely publishes Baltimore city under a different name. Worth a follow-up probe but not blocking.
- **Q13 (Redfin SA at county level)**: the cache discards the `is_seasonally_adjusted` flag, so the project cannot verify from current data whether any DMV county rows arrive flagged SA. Redfin's documentation implies county rows are NSA. If exact seasonal handling matters, the ingester would need to be extended to retain the flag.

## Next
**Phase:** Design
**Artifact to review:** `docs/crispy/regional-inventory/2-research.md`
**Action:** Review research findings. Then invoke `crispy-design` with project name `regional-inventory`.
