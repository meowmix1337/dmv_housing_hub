# Design

## Current State

Six ingesters (`fred`, `census`, `bls`, `zillow`, `redfin`, `qcew`) write to `scripts/.cache/`; one transform (`build-county-pages.ts`) joins them into 21 county JSONs plus 3 DMV-aggregate metric JSONs and a `manifest.json` with `lastUpdated` per source. The web app reads JSON via React Query.

Accuracy posture today:
- `DMV_COUNTIES` (21 jurisdictions in `shared/src/counties.ts`) does not match any single OMB boundary — it includes 4 Baltimore-area MD counties not in MSA-47900 and omits 7 OMB MSA jurisdictions (Fauquier/Culpeper/Warren/Clarke/Rappahannock VA, Fredericksburg city VA, Jefferson WV).
- ACS pinned to 2019–2023 vintage (`ACS_YEAR = 2023`); 2020–2024 vintage was released 2026-01-08.
- `current.affordabilityIndex` is a PITI/income ratio (0.30–0.46, lower = more affordable). NAR HAI is the conventional public metric (~30–200, higher = more affordable). The two are inverses with different inputs.
- `current.marketHealthScore` is a bespoke weighted composite with no published-methodology citation.
- DMV aggregates (`active-listings-dmv.json`, `federal-employment-dmv.json`) are sums across the 21 in-repo FIPS, not values published by any upstream source.
- ACS estimates are stored without margins of error (MOE).
- `manifest.json` exposes `lastUpdated` per source but no per-chart citation/source label is rendered on the UI (per the research pass; not re-verified against `web/src/`).
- No documented spot-check workflow; no record of when values were last cross-checked against upstream.

## Desired End State

A reader (human or AI) can:
1. Look at any number on the site and trace it to a single named upstream source plus an "as of" date.
2. Run a spot-check workflow against the named upstream source via `DATA_SOURCES.md` instructions.
3. Trust that derived metrics (affordability, market health) follow a documented public methodology, or are clearly labeled as bespoke with the formula linked.
4. See FIPS coverage that maps to one declared boundary (with rationale captured in `ARCHITECTURE.md` or `DATA_SOURCES.md`).

Concretely:
- ACS refreshed to 2020–2024 (`ACS_YEAR = 2024`); MOEs captured for the four county-level estimates.
- `current.affordabilityIndex` recomputed via the NAR HAI convention; field name and unit semantics updated.
- Each upstream source has a documented spot-check URL and instructions in `DATA_SOURCES.md`.
- `DMV_COUNTIES` is documented (kept-as-is or revised) with the rationale for the chosen boundary.
- Web UI shows source attribution per chart/value, plus a global freshness banner driven by `manifest.json`.

## Architecture Decisions

### Spot-check verification, not automated harness

**Decision:** Use manual spot-check against documented upstream URLs once per ingest cycle (rather than a vitest job that hits live APIs).

**Why:** This is a once-monthly batch pipeline; live-API tests would flake on rate limits, become a CI cost, and would not catch the semantic errors (boundary mismatch, NAR HAI inversion) that drove this validation effort. Spot-check + a written workflow gives 80% of the value at 5% of the maintenance cost.

**Trade-off:** Drift between an upstream silent revision and the next manual check goes undetected. Mitigated by `manifest.lastUpdated` per source plus an explicit "last verified" date in `DATA_SOURCES.md` per source.

### Replace `affordabilityIndex` with NAR HAI

**Decision:** Drop the PITI/income ratio. Compute `HAI = (median_household_income / qualifying_income) × 100`, where `qualifying_income = monthlyPI × 4 × 12`, `monthlyPI` from an 80%-LTV 30-year-fixed at the latest PMMS rate. Drop tax/insurance from the qualifier. Note the household-vs-family-income substitution in `DATA_SOURCES.md`.

**Why:** The NAR HAI is the most familiar public affordability metric; users reading "affordability index = 0.42" will misinterpret it given NAR's convention is ~100. Aligning with NAR makes the value self-explanatory and externally cross-checkable.

**Trade-off:** We lose tax and insurance from the calculation, which were locally relevant (DC has high property tax; VA cities differ). Acceptable because (a) NAR's published HAI is the comparator, and (b) tax/insurance can be re-introduced as a separate "DMV-adjusted HAI" later if needed.

### Refresh ACS to 2020–2024 vintage

**Decision:** Bump `ACS_YEAR` from 2023 to 2024, change the API base URL to `…/2024/acs/acs5`, set `OBSERVED_AT = '2024-01-01'`, and re-run the census ingester + transform.

**Why:** The 2020–2024 vintage was released by Census on 2026-01-08; we are 4 months behind the public release. ACS variables (`B19013_001E`, `B25077_001E`, `B25064_001E`) are stable across vintages, so this is a one-line bump plus a re-run.

**Trade-off:** Historical comparisons against the 2019–2023 vintage become apples-to-oranges (different rolling-5-year window). Acceptable: ACS values change slowly and the user-visible dimension is "median household income for County X right now," not a time series.

### Capture ACS margins of error

**Decision:** Extend `scripts/ingest/census.ts` to also fetch `_001M` (MOE) variables alongside `_001E` (estimate). Store on the observation as an optional `moe?: number` field on `Observation` (or a parallel field on `CountySummary`).

**Why:** ACS reuse guidelines require MOE publication. With small populations (e.g. Falls Church city, 14k people), MOE on median household income can be 10–20% of the estimate; presenting the point estimate alone is misleading.

**Trade-off:** Adds a field to `shared/types.ts`. Frontend consumers must decide whether/how to surface MOE in the UI; for v1 we can capture-and-not-display.

### Add per-source citation UI + freshness banner

**Decision:** Render a "Source: …, as of …" line under each chart and snapshot value, sourced from a small static citation map keyed by metric. Add a global "Data last refreshed: {manifest.generatedAt}" banner in the page header.

**Why:** Public dashboards that don't cite sources are routinely flagged as misleading; explicit attribution matches FRED/BLS/Census/Zillow/Redfin reuse guidelines and lets users verify independently.

**Trade-off:** Adds visual noise. Mitigated by terse formatting (one inline line per chart) and only showing the freshness banner when any source is `>30 days` past its expected cadence.

### Document the spot-check workflow in `DATA_SOURCES.md`

**Decision:** Add a "Verification" section to `DATA_SOURCES.md` listing, per source: the spot-check URL, what to compare, the chosen sentinel FIPS (DC `11001`, Montgomery `24031`, Fairfax `51059`, Falls Church `51610`), and a "last verified" date column.

**Why:** Verification practice that lives only in `2-research.md` will not be discovered by future agents working on `scripts/ingest/`. `DATA_SOURCES.md` is already the named entry point for ingester contracts (per `CLAUDE.md`).

**Trade-off:** Adds maintenance burden — the "last verified" dates must be updated. Acceptable given the once-a-month cadence.

### DMV boundary: investigate before changing

**Decision:** Do not modify `DMV_COUNTIES` in this work cycle. Instead, produce a `docs/dmv-boundary-options.md` comparison of three candidate boundaries — current 21-jurisdiction list, MSA-47900 (24 jurisdictions), and CSA-548 (Wash + Baltimore, 38 jurisdictions) — with per-source data-coverage tradeoffs and a recommended choice. Defer the actual list change to a follow-up cycle.

**Why:** The boundary choice is a product decision with cascading effects (FIPS list, DMV aggregates, MSA-level Zillow series, choropleth bounding box). Surfacing the tradeoffs in a small focused doc lets the project owner weigh them; jamming the choice into a validation PR risks an uninformed change.

**Trade-off:** The boundary mismatch persists for one more cycle. Acceptable because it is a known-and-documented condition, not silent misinformation.

## Patterns to Follow

- **Ingester contract** (`DataSource` interface): keep new code on this pattern. The MOE addition extends `Observation`, not the interface.
- **Atomic file writes** via `scripts/lib/storage.ts`: use for any new derived JSON outputs (e.g. an MOE-augmented county summary).
- **Log-warn-and-skip** on missing upstream values (don't invent or zero-fill): preserve this for the new ACS-MOE path.
- **Source/series provenance on every observation**: keep `source` and `series` populated end-to-end so the UI citation map can resolve back to upstream.
- **Manifest per-source `lastUpdated`**: extend with an optional `lastVerified` date populated from `DATA_SOURCES.md` when present.

Reject:
- **Bespoke composite scores without a public methodology citation.** `marketHealthScore` should either link a published methodology or be relabeled as "DMV Housing Hub composite (in-house)" with the formula visible in tooltips. Following research, no industry-standard composite was identified — relabel rather than rename.
- **DMV aggregates published as if they were canonical.** `active-listings-dmv.json` and `federal-employment-dmv.json` are sums across the in-repo 21-FIPS list; the JSON should declare `aggregation: 'in-repo county sum'` and list which FIPS contributed, so a downstream reader cannot mistake the sum for an upstream-published number.

## Open Questions

- **DMV boundary:** which of the three candidates (in-repo 21, MSA-47900, CSA-548) should win in the follow-up cycle? `dmv-boundary-options.md` will frame the tradeoffs; the project owner picks.
- **MOE display:** capture-and-not-display in v1, or surface inline as "$95,400 ± $4,200" on the County page?
- **`marketHealthScore` rename:** keep the field name, or rename to `dmvCompositeScore` to make the in-house provenance unmistakable?
- **PMMS rate selection for HAI:** use the latest weekly PMMS value at build time, or a 4-week trailing average to dampen weekly volatility?
- **Frontend FHFA HPI YoY rendering** (carried over from research): is the choropleth currently computing YoY from `series.fhfaHpi` on the client, and is the math correct? Needs a quick read of `web/src/pages/Home.tsx` and the choropleth component during outline phase.

## Next
**Phase:** Outline
**Artifact to review:** `docs/crispy/validate-public-data/3-design.md`
**Action:** Review decisions and open questions. Then invoke `crispy-outline` with project name `validate-public-data`.
