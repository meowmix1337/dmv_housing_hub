---
name: spot-check-upstream-data
description: Cross-check the in-repo data files under `web/public/data/` against the six upstream sources (FRED, Census ACS, BLS LAUS, BLS QCEW, Zillow ZHVI, Redfin). Use when the user says "spot-check the data", "validate upstream", "verify data freshness", "is the data still accurate", or before/after running the monthly ingest. Produces a dated log under `docs/verification/` and stamps `lastVerified` through `manifest.json`.
---

# Spot-check upstream data

Repeatable, evidence-driven verification pass over `web/public/data/`. Run this at every monthly ingest, after any ingester change, and any time the user asks whether the in-repo numbers still match upstream.

## When to invoke

- User says: "spot-check", "validate upstream", "verify data", "is the data accurate", "cross-check the sources".
- After running `npm run ingest --workspace=scripts` to confirm the pipeline produced sane values.
- Before announcing data is "fresh" or "verified" in any user-facing context.
- When `manifest.json`'s `lastVerified` date is more than ~30 days old.

## Sentinel FIPS — pick these four every time

```
11001  District of Columbia  (core urban; jurisdiction = DC)
24031  Montgomery County     (large MD suburb)
51059  Fairfax County        (large VA suburb)
51610  Falls Church city     (tiny VA independent city; tests small-coverage edges)
```

Rationale: four points are enough to catch most ingester bugs without burning credits/time. The sentinels deliberately span the data-coverage spectrum: one core-urban county where every source has data; two large suburbs where coverage is reliable; one tiny independent city where Redfin/Zillow coverage often gets sparse.

If a sentinel is **missing** from an upstream source, that itself is a finding — log it.

## Process (run in order)

### 1. Collect in-repo sentinel values

```bash
node -e "
const fips = ['11001','24031','51059','51610'];
for (const f of fips) {
  const j = require('./web/public/data/counties/'+f+'.json');
  console.log(f, j.name);
  console.log('  fhfaHpi tail:', JSON.stringify(j.series.fhfaHpi?.at(-1)));
  console.log('  current.zhvi:', j.current.zhvi);
  console.log('  current.unemploymentRate:', j.current.unemploymentRate);
  console.log('  current.federalEmployment:', j.current.federalEmployment,
              '(asOf', j.current.federalEmploymentAsOf+')');
  console.log('  current.activeListings:', j.current.activeListings);
  console.log('  current.medianSalePrice:', j.current.medianSalePrice);
  console.log('  current.daysOnMarket:', j.current.daysOnMarket);
  console.log('  medianHouseholdIncome:', j.medianHouseholdIncome);
}
const m = require('./web/public/data/metrics/mortgage-rates.json');
console.log('mortgage 30y tail:', JSON.stringify(m.points.at(-1)));
"
```

### 2. Hit each upstream source

The recipes below are the exact pipelines that worked in the 2026-05-10 pass. Notes call out the known gotchas — do not waste time re-discovering them.

#### FRED — county FHFA HPI + national mortgage rate

```bash
# County HPI (annual; latest is current_year - 1)
for f in 11001 24031 51059 51610; do
  echo "=== ATNHPIUS${f}A ==="
  curl -sS "https://fred.stlouisfed.org/graph/fredgraph.csv?id=ATNHPIUS${f}A" | tail -3
done

# 30-year mortgage rate
curl -sS "https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US" | tail -5
```

**Tolerance**: exact match (FRED publishes 2-decimal rounded values).
**Gotcha**: plain CSV; no quoting, no User-Agent needed. WebFetch tool returns 403 on `fred.stlouisfed.org` HTML pages, but `fredgraph.csv` works.

#### BLS LAUS — county unemployment rate

```bash
curl -sS -X POST "https://api.bls.gov/publicAPI/v2/timeseries/data/" \
  -H "Content-Type: application/json" \
  -d '{"seriesid":["LAUCN110010000000003","LAUCN240310000000003","LAUCN510590000000003","LAUCN516100000000003"]}' \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
for s in r.get('Results', {}).get('series', []):
    sid = s['seriesID']
    data = s.get('data', [])
    if not data: print(sid, 'no data'); continue
    latest = data[0]  # newest first
    print(sid, latest['periodName'], latest['year'], '=', latest['value'])
"
```

**Tolerance**: 0.1 percentage point.
**Gotcha**: `bls.gov/web/metro/laucntycur14.txt` returns Access Denied to anonymous curl, even with `-A "Mozilla/..."` User-Agent. **Use the public API instead** — it works without an API key, limited to 25 series/day per anonymous IP.

#### QCEW — county federal employment

```bash
# year=current_year-1 typically; quarter is Q3 if reading 2025-09-01
for f in 11001 24031 51059 51610; do
  echo "=== ${f} ==="
  curl -sS "https://data.bls.gov/cew/data/api/2025/3/area/${f}.csv" \
    | awk -F, '$2=="\"1\"" && $4=="\"71\"" && $3=="\"10\""' \
    | head -1 \
    | awk -F, '{print "month3_emplvl:", $12}'
done
```

**Tolerance**: exact integer.
**Filter**: federal employment = `own_code=1` (Federal Government), `agglvl_code=71` (county-by-ownership), `industry_code=10` (all industries total).
**Read**: `month3_emplvl` (column 12) is the last month of the quarter, which is what the ingester uses.
**Gotcha**: `own_code`, `industry_code`, `agglvl_code` are all quoted in the CSV (`"1"` not `1`).

#### Zillow ZHVI

```bash
URL="https://files.zillowstatic.com/research/public_csvs/zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
curl -sS "$URL" | awk -F, 'NR==1{next}
  ($3=="District of Columbia"||$3=="Montgomery County"||$3=="Fairfax County"||$3=="Falls Church City") &&
  ($5=="DC"||$5=="MD"||$5=="VA") {
    printf "%s, %s: latest=%s\n", $3, $5, $NF
  }'
```

**Tolerance**: ±$1 (rounding).
**Gotcha**: Falls Church city appears as `RegionName="Falls Church City"` (capital C, no comma suffix). Plain CSV, no quoting on data cells.

#### Redfin — active listings, median sale price, days on market

```bash
URL="https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz"

# Latest snapshot — pick the right PERIOD_END (e.g. 2026-03-31 for a March monthly)
curl -sS "$URL" | gunzip | awk -F'\t' '
  NR==1{next}
  $3=="30" && $4=="\"county\"" && $12=="\"All Residential\"" &&
  ($8=="\"District of Columbia, DC\"" || $8=="\"Montgomery County, MD\"" ||
   $8=="\"Fairfax County, VA\"" || $8=="\"Falls Church, VA\"") &&
  $2=="\"2026-03-31\"" {
    print $8, "| inv=" $35, "| msp=" $14, "| dom=" $41
  }'
```

**Tolerance**: ±1 for inventory (see variance note below); exact dollars for median sale price; exact for DOM.
**Gotchas**:
- TSV is gzipped (~600MB+ download time). Stream-and-filter; don't save to disk.
- Quoting is **mixed**: `PERIOD_END` is quoted (`"2026-03-31"`), but `PERIOD_DURATION` is not (`30`). Your awk filters must match the actual quoting per column.
- Falls Church city is published as `"Falls Church, VA"` (no "city" suffix). The ingester handles this via a Redfin alias in `scripts/ingest/redfin.ts`.
- **Known variance — not a bug**: in-repo `current.activeListings` is the sum of per-property-type rows (SFH + condo + townhouse + multi-family), not Redfin's `All Residential` aggregate. The two typically differ by 0–5 units per county per month. If the diff is larger, it's worth investigating.

Column indexes for reference: `2=PERIOD_END, 3=PERIOD_DURATION, 4=REGION_TYPE, 8=REGION, 12=PROPERTY_TYPE, 14=MEDIAN_SALE_PRICE, 35=INVENTORY, 41=MEDIAN_DOM`.

#### Census ACS — median household income

If the ACS ingester ran in the current session, the in-repo values came straight from the live API — they match by construction. If they didn't, hit the API directly:

```bash
# Requires CENSUS_API_KEY in the shell (do NOT source .env per project memory)
curl -sS "https://api.census.gov/data/2024/acs/acs5?get=NAME,B19013_001E,B19013_001M&for=county:001&in=state:11&key=$CENSUS_API_KEY"
```

**Tolerance**: exact dollars on the estimate; `_001M` value should be captured as `Observation.moe` on every census row in `scripts/.cache/census.json`.

### 3. Build a comparison table

For each (source, sentinel, metric) row: in-repo value, upstream value, match indicator, notes. Use this exact column shape:

```md
| source | sentinel | metric | in-repo | upstream | match? | notes |
|---|---|---|---|---|---|---|
```

Mark each row `✓` (exact match within tolerance), `⚠` (variance with a documented root cause), or `✗` (unexplained discrepancy).

### 4. Decide what each row means

| outcome | action |
|---|---|
| All ✓ | Continue to step 5. |
| Known variance ⚠ (e.g. Montgomery activeListings 1856 vs 1858 — property-type sum vs all-residential) | Document the root cause in the log; don't re-investigate. |
| Unexplained ✗ | **Stop.** Open a GitHub issue (`gh issue create`) titled `Data discrepancy: <source> <metric> <fips>`. Include FIPS, metric, in-repo value, upstream value, upstream URL, timestamp. **Do not silently overwrite the in-repo value.** |
| Sentinel absent from upstream | Log as a coverage finding; check `coverage.missing` on the relevant aggregate. |

### 5. Record the results

Write a new file at `docs/verification/{YYYY-MM-DD}-spot-check.md` with:

1. Top heading: `# Spot-check {date}`.
2. The comparison table (step 3).
3. A "Variances" section explaining any ⚠ rows.
4. A "Method notes for the next operator" section if you discovered a new gotcha.

Use the prior log (`docs/verification/2026-05-spot-check.md`) as a structural template.

### 6. Update `DATA_SOURCES.md`

Bump the `Last verified: YYYY-MM-DD` line under each `### <source>` subsection of the `## Verification` section to the run date.

### 7. Re-flow `lastVerified` into `manifest.json`

```bash
npm run transform --workspace=scripts
```

This re-reads `DATA_SOURCES.md`, picks up the new dates via `scripts/lib/verification.ts`, and writes them to `web/public/data/manifest.json` so the frontend `<FreshnessBanner>` sees them.

### 8. Commit

```bash
git add docs/verification/{date}-spot-check.md DATA_SOURCES.md web/public/data/manifest.json
git commit -m "data: spot-check {date} across all 6 sources"
```

If there were discrepancies, open issues — don't roll fixes into the verification commit.

## Anti-patterns — don't do this

- **Don't** silently overwrite an in-repo value to match upstream. The audit trail is more valuable than the convergence.
- **Don't** trust a single sentinel. The four sentinels were chosen to exercise different coverage edges; using one means you might miss a small-county-only bug.
- **Don't** verify only "current values." Check at least the latest tail on series data (FHFA HPI annual, ZHVI monthly, mortgage rate weekly).
- **Don't** invent verification dates. If you can't actually reach an upstream source in this session (network down, API blocked, key missing), record the row as `deferred` rather than as `✓`.
- **Don't** verify the DMV aggregates (`active-listings-dmv.json`, `federal-employment-dmv.json`) against any single upstream region — they are in-repo sums labeled `aggregation: 'in-repo county sum'`. Verify their per-county *inputs* instead.
- **Don't** modify the ingester or transform code as part of this workflow. Verification is read-only. If the data is wrong, that's a separate PR with its own discussion.

## Output expected

A new file under `docs/verification/`, a `DATA_SOURCES.md` date bump, a regenerated `manifest.json` with new `lastVerified` dates, and either "all clear" or a list of GitHub issues for any unexplained discrepancies.
