# Design

## Current State

- `MetricId` union already declares `federal_employment` (`shared/src/types.ts:38`), but the only series produced today is **MSA-scale, CES-derived** (`SMU11479009091000001`, attached to pseudo-FIPS `'11-metro'`) in `scripts/ingest/bls.ts:13-14, 60-65`.
- No county-level federal-employment data exists in `scripts/.cache/` or `web/public/data/counties/{fips}.json`. The MSA-level value isn't even surfaced on `CountySummary`.
- Existing BLS ingester pattern is mature: batched POST to `api.bls.gov/publicAPI/v2/timeseries/data/`, Zod-validated response (`BlsResponseSchema`), typed `IngestError`, structured Pino logging, retry/back-off via `fetchWithRetry`.
- `Cadence` already includes `'quarterly'` (`shared/src/types.ts:7`). `Unit` already includes `'count'` and `'USD'`.
- `CountySummary` shape (`shared/src/types.ts:119-130`) has `current` snapshot + `series` arrays per metric — but **no `federalEmployment` field on either**. Adding one requires editing `shared/src/types.ts` (and consuming it in `web/src/api.ts`), per `CLAUDE.md`.
- All 21 DMV county-equivalents return non-suppressed QCEW federal-ownership rows for every sampled quarter 2015–2024 (research §Q11; 0/336 suppressed).
- BLS QCEW series-ID encoding (`ENU{fips}{datatype}{size}{ownership}{naics}`) is documented and the FIPS slice is identical to the repo's canonical FIPS list — direct concatenation works.

## Desired End State

1. **New ingester** `scripts/ingest/qcew.ts` produces `Observation[]` with `metric='federal_employment'`, `unit='count'`, one quarterly point per DMV county per quarter, 2015 → present.
2. **Cache file** `scripts/.cache/qcew.json` follows the existing `CachedRun` envelope (`scripts/transform/build-county-pages.ts:29-44`).
3. **Transform** joins QCEW observations into `CountySummary` for each of the 21 DMV counties:
   - `current.federalEmployment` — latest disclosed quarterly value
   - `current.federalEmploymentYoY` — YoY change vs. same quarter prior year
   - `series.federalEmployment` — `MetricPoint[]` for the County-page chart
4. **County page** renders a `MetricCard` (latest value + YoY) and adds the series to its quarterly-cadence chart group. Existing repo charting (Recharts) handles the rendering.
5. **Home / overview page** shows a single "DMV federal jobs" stat (sum across 21 counties, latest quarter, YoY).
6. **Manifest** has a `qcew` entry with `cadence: 'quarterly'` and `lastUpdated` timestamp; the GitHub Actions cron runs the ingester on a schedule that lines up with BLS's ~6-month lag (see Open Question §3).

## Architecture Decisions

### Access mechanism
**Decision:** Use the **keyless CSV slice endpoint** at `https://data.bls.gov/cew/data/api/{YEAR}/{QTR}/area/{FIPS}.csv`, in a new file `scripts/ingest/qcew.ts`. Pull one CSV per DMV county per quarter; filter rows to `own_code=1, agglvl_code=71, industry_code=10`; extract `month3_emplvl` as the metric value.
**Why:** Confirmed empirically (see Open Question §1 resolution below) that the BLS Public Data API v2 does **not** serve quarterly QCEW totals — it only serves annual averages of specific 6-digit NAICS codes (datatype 5, period `A01`). Aggregate industry codes like `"10"` (total all industries) return *Series does not exist* on the timeseries endpoint. The CSV slice endpoint is therefore the only viable path for the desired metric. Empirical fetches (336 in research, 16 more in this design phase) completed without throttling. No API key required.
**Trade-off:** ~840 small HTTPS GETs for backfill (vs. one POST that would have worked if the API path had been viable), and we lose the existing `bls.ts` Zod-validated POST scaffolding. The replacement is a CSV parser, which is cheap; existing libraries like `csv-parse` (already a transitive dep) handle the work. The 42-field flat layout is stable and documented.

### Separate ingester vs. extend `bls.ts`
**Decision:** New file `scripts/ingest/qcew.ts`, registered as source `'qcew'` (cadence `'quarterly'`). Add `'qcew'` to the `SOURCES` tuple at `scripts/transform/build-county-pages.ts:46` and a `cadenceFor` arm returning `'quarterly'`.
**Why:** QCEW is a distinct BLS program with a distinct release cadence (quarterly vs the monthly LAUS/CES content of `bls.ts`) **and** uses an entirely different access mechanism (keyless CSV slices vs. keyed POST). Mixing them in one file would conflate two HTTP shapes, two parsers, and two retry profiles.
**Trade-off:** Two BLS-related ingesters in the tree. Trivial; their only shared concept is "data is published by BLS."

### Metric scope (v1)
**Decision:** v1 ingests **only `federal_employment`** as a typed metric. Do **not** add `federal_avg_weekly_wage` or `federal_establishments` MetricIds yet.
**Why:** The task frames the work as "federal employment data." Although the same QCEW CSV row carries all three measures and parsing them costs nothing extra, surfacing additional metrics requires schema changes (new `MetricId`s, new `CountyCurrentSnapshot`/`CountySeries` fields, new UI cards) that expand v1 scope and decision surface for the County page layout.
**Trade-off:** Wages and establishment counts are visible during parsing and trivially recoverable in v2. The CSV is downloaded once and discarded — no re-fetch cost when v2 lands.

### Which monthly value within a quarter?
**Decision:** Use **`month3_emplvl`** (the third month of the quarter) as the canonical employment value. Map `observedAt` to the first day of the quarter's third month (e.g., Q1 → `YYYY-03-01`).
**Why:** Aligns with how the existing CES MSA series anchors to the reference month, keeps `observedAt` a real ISO date (not "Q1 2024"), and avoids fictitious quarterly averaging that would smear local hiring shocks.
**Trade-off:** A reader expecting "the Q1 number" sees the March value, not an average. Documented in the metric description; this is a common BLS convention.

### Coexistence with the existing MSA-level CES series
**Decision:** **Keep** the existing `SMU11479009091000001` ingestion in `scripts/ingest/bls.ts`. Both series will write `metric='federal_employment'` but with **different `fips`** (county FIPS vs `'11-metro'`) and **different `source`** (`'qcew'` vs `'bls'`). The transform's existing dedup key `${source}:${fips}:${metric}:${observedAt}` (`build-county-pages.ts:97`) keeps them from colliding.
**Why:** The CES series is monthly with a 3-week lag and is the freshest federal-jobs indicator available for the metro; QCEW is quarterly with a 6-month lag but is a true universe count and resolves to county. They serve different surfaces (Home overview = freshness; County page = precision).
**Trade-off:** Two `federal_employment` datasets with different cadences and methods may confuse a casual reader. Mitigation: clear source attribution on each surface.

### Backfill window
**Decision:** **2015 → present**, matching `START_YEAR='2015'` in `scripts/ingest/bls.ts:10`.
**Why:** Same horizon as every other BLS-derived series in the repo, so chart x-axes line up across MetricCards. QCEW history extends earlier but adds no value for a housing dashboard whose other series start in 2015.
**Trade-off:** Loses 2008/2013 federal-shutdown context. Acceptable for v1.

### Fetch concurrency
**Decision:** Bounded concurrency of **4** parallel CSV fetches via a hand-rolled promise pool inside `qcew.ts` (avoids the new `p-limit` dependency). Every request still routes through `fetchWithRetry` with a per-request `label` like `qcew:51059:2024Q1` so retries are diagnosable.
**Why:** A monthly cron run re-fetches the full window (~840 CSVs) since the existing repo norm is full re-fetch per run rather than delta-sync. Sequential = ~3 min wall time; concurrency 4 = ~30 sec, saving ~2.5 min/run × 12 runs/yr. `data.bls.gov` is CDN-fronted; 4 concurrent connections is well within polite-client norms (browsers open 6+ to a single host). `fetchWithRetry`'s 429/5xx backoff is a safety net if BLS ever introduces a documented rate limit.
**Trade-off:** Slightly noisier failure modes — when one of four parallel fetches fails its retry budget, the pool's other three may have already started, so a final error message lists one root cause but the run aborts mid-window. Acceptable; the run is idempotent.

### CountySummary schema additions
**Decision:** Add to `CountyCurrentSnapshot`:
```ts
federalEmployment?: number;          // latest disclosed quarterly employment count
federalEmploymentYoY?: number;       // YoY % change vs same quarter prior year, decimal
federalEmploymentAsOf?: string;      // ISO date of the quarter the latest value came from
```
And to `CountySeries`:
```ts
federalEmployment?: MetricPoint[];   // quarterly series, observedAt = month 3 of quarter
```
**Why:** Mirrors the existing `zhvi` / `zhviYoY` / `series.zhvi` triplet (`shared/src/types.ts:96-113`). The new `federalEmploymentAsOf` field makes the staleness explicit — useful regardless of suppression because every QCEW value is ≥6 months old, and essential when fall-back-to-prior-quarter logic kicks in (see Suppression handling decision below).
**Trade-off:** Four optional fields instead of three. The County page must handle `undefined` (which it already does for every other optional metric).

### Suppression handling
**Decision:** Three-layer behavior for rows with `disclosure_code='N'`:
1. **Ingester** logs `warn` and skips the row; emits no `Observation` for that (county, quarter).
2. **Transform** populates `current.federalEmployment` and `current.federalEmploymentYoY` from the **most recent disclosed observation**, even if that's not the latest quarter; `current.federalEmploymentAsOf` records its `observedAt`. `series.federalEmployment` contains only disclosed points (a gap will appear in the chart for any suppressed quarter).
3. **County page UI** treats `undefined` as `—` and hides the YoY line; no special "data unavailable" badge.

**Why:** Matches `CLAUDE.md`'s "log a warn and skip when upstream data is missing — never invent values." Falling back to the prior quarter is graceful and honest because QCEW is structurally a lagging indicator — "current" already means "as of last published quarter," so showing the most recent disclosed value with its date is a small, principled extension. Empirically 0% of DMV historical rows are suppressed (research §Q11), so this branch is defensive rather than load-bearing.
**Trade-off:** Adds a "find latest disclosed" pass in the transform; trivial. No interpolation or imputation across gaps.

### Overview-page surfacing
**Decision:** v1 surfacing is **textual + chart only**, not a new choropleth layer.
- Home: single stat block "DMV federal jobs: {sum} ({YoY%})" computed in the transform from the 21 county values.
- County page: `MetricCard` + Recharts line in the existing layout.
- Defer choropleth toggle (color-by-federal-jobs-per-capita) to v2.
**Why:** The choropleth currently colors by FHFA HPI YoY; adding a runtime layer toggle requires UI work in `Home.tsx` and a categorical/quantitative scale switch in MapLibre that is out of scope for "ingest + surface" v1.
**Trade-off:** Less visually striking than a layered map. Earns its way in v2 once the data is proven and the population denominator (already in `getPopulationByFips`, `scripts/lib/populations.ts`) is reused for per-capita normalization.

## Patterns to Follow

- **Follow `scripts/ingest/redfin.ts`** for the CSV-parsing shape (rather than `bls.ts`): redfin reads upstream tabular files and emits `Observation[]`; the same skeleton applies — fetch, parse, filter to relevant rows, map to `Observation`.
- **Follow `scripts/lib/http.ts`** (`fetchWithRetry`) for every outbound request, with explicit `label` per call (e.g., `qcew:11001:2024Q1`) so retry logs are diagnosable.
- **Follow `scripts/ingest/fred.ts`** for value sanitization: skip rows where `month3_emplvl` does not parse as a finite number; never invent a value when `disclosure_code === 'N'`.
- **Follow `scripts/ingest/bls.ts`** for the source-class envelope: a class implementing `DataSource`, structured Pino logging, typed `IngestError` with `source: 'qcew'`, schema-validated I/O at the parser boundary.
- **Follow the `Observation → CountySummary` flow** in `scripts/transform/build-county-pages.ts`: filter by `(source, metric)`, sort by `observedAt`, build `MetricPoint[]` for `series.federalEmployment`, take last point for `current.federalEmployment`, compute YoY by looking back 4 observations (quarters).
- **Use the composite series identifier** `qcew:{fips}:{year}Q{qtr}:own1:naics10` as the `series` field on each `Observation`. This captures the QCEW selection key for citation without inventing a synthetic `ENU…` ID that the BLS API does not actually serve.
- **Reject** ingesting all 42 QCEW fields into `Observation`. Only the employment number is the value; the `series` string preserves the source row identity for citation, satisfying the repo's "every Observation retains source and series for citation" rule (`CLAUDE.md`).
- **Reject** introducing a `'qcew'` ownership/industry abstraction in `shared/src/types.ts`. The selection is fixed (`own=1, agglvl=71, industry=10`) for v1; downstream consumers don't need typed access to those dimensions.

## Open Questions

None remaining. Original questions and their resolutions:

1. ~~Does the BLS Public Data API v2 accept QCEW `ENU…` series IDs?~~ **Resolved by spike:** No — the API serves QCEW *annual averages* of *specific 6-digit NAICS codes* only (datatype `5`, period `A01`). All aggregate-industry encodings (`100000`, `10----`, `000010`, `000000`) returned *Series does not exist*. Quarterly county × federal × all-industries totals are only available via the keyless CSV slice endpoint. → Decision §1 (Access mechanism).
2. ~~Exact `ENU…` encoding for `agglvl=71, own=1, industry=10`.~~ **Resolved:** No such API encoding exists. The selection is expressed via CSV row filter, not a synthetic series ID.
3. ~~Cron schedule.~~ **Out of scope:** the user merged a unified monthly cron pattern; this ingester registers into that flow.
4. ~~Backfill / fetch concurrency.~~ **Resolved:** bounded concurrency of 4. See "Fetch concurrency" decision.
5. ~~Sentinel behavior for `disclosure_code='N'`.~~ **Resolved:** ingester skips, transform falls back to most recent disclosed value with `federalEmploymentAsOf` date, UI shows `—` for fully-undefined. See "Suppression handling" decision.

## Locked-In UX/Policy Choices (documented for traceability)

- **Citation string on UI surfaces:** "Source: U.S. Bureau of Labor Statistics, Quarterly Census of Employment and Wages" — matches the format of other source labels on the County page; conservative and non-controversial for a federal-government public dataset.
- **Manassas Park (FIPS 51685, ~25 federal jobs) display rule:** render the value as-is. BLS already enforces its own confidentiality screen via `disclosure_code`; a disclosed value is legal to publish, and overriding BLS with project-level redaction would silently misrepresent the data.

## Research Gaps Affecting Design

- The exact BLS attribution language is unresolved (research §Q7) — addressed by the locked-in conservative citation string above.
- Documented rate limits for the CSV slice endpoint (research §Q6) — empirical 350+ fetches completed without throttling; mitigated by bounded concurrency of 4 and `fetchWithRetry`'s built-in 429/5xx backoff.
- FRED republication coverage (research §Q15) — irrelevant; the design uses BLS directly.

## Next
**Phase:** Outline
**Artifact to review:** `docs/crispy/qcew-federal-employment/3-design.md`
**Action:** Review decisions and open questions. Then invoke `crispy-outline` with project name `qcew-federal-employment`.
