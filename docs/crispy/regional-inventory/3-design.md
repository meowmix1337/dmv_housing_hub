# Design

## Current State

- Per-county Redfin `active_listings` flows from ingester → cache → `series.activeListings` in each `web/public/data/counties/{fips}.json`. 19 of 21 DMV FIPS are populated; Baltimore city `24510` and Fairfax city `51600` are missing because of a name-matching gap in `scripts/ingest/redfin.ts:51-55`.
- The Redfin cache already contains all five property-type series per county (`all_residential` 39,353 / `single_family` 39,328 / `townhouse` 38,744 / `condo` 34,426 / `multi_family` 8,585). The build-county-pages dedup at `:86-101` discards 4 of them, keeping only `all_residential`. No upstream re-fetch is needed to expose the breakdown — only transform changes.
- No materialized regional aggregate. Home page shows a placeholder card at `web/src/components/home/WhatsDriving.tsx:138-147` ("Regional inventory chart coming soon"). The MetricStrip "Active listings" tile already sums latest county values client-side via `web/src/lib/metro.ts:30-34`, but its YoY value is buggy (`web/src/lib/metro.ts:55` returns `median(salePriceYoYs)`).
- County page does not render inventory at all (`web/src/pages/County.tsx` has no `activeListings` reference).
- Two existing values appear corrupted by the build-county-pages dedup: Montgomery County `24031` latest=153, Frederick `24021` MoM σ ≈ 56%. Cause is likely the dedup at `build-county-pages.ts:86-101` mixing weekly (`PERIOD_DURATION=7`) and monthly (`PERIOD_DURATION=30`) Redfin rows on the same `observedAt` date — the period flag is dropped at parse time in `scripts/ingest/redfin.ts:62-63` so both periods collapse together.
- Aggregation precedent exists: `build-county-pages.ts:354-388` builds `federal-employment-dmv.json` by summing QCEW counts across all DMV counties for each quarter, emitting a value only when every county reports.

## Desired End State

- Home page shows a real regional active-listings **stacked area chart** in the "What's driving the market" 2×2 grid (replacing the placeholder tile). Stack composition: single-family + condo + townhouse + multi-family. Visual matches the prototype `claude_design/home.jsx:346-381` (red gradient `#A4243B` for the stack baseline / per-type tints above it, mono ticks). Source line cites Redfin and the latest data date.
- A new file `web/public/data/metrics/active-listings-dmv.json` is published by the transform step. Shape: per-month points with `{ date, total, byType: { single_family, condo, townhouse, multi_family } }`, plus latest scalar + YoY. Mirrors the precedent of `federal-employment-dmv.json` but with per-type breakdown.
- County JSONs gain a property-type-aware inventory shape — `series.activeListings` becomes either `{ total: MetricPoint[], byType: { ... } }` or a sibling field, so the County page can render the same stacked chart per county.
- County page: inventory chart is the **last section** on the page (after price, DOM, etc.), styled to match the home stacked-area chart at smaller dimensions.
- County page Market Health card incorporates inventory YoY — either as a 4th composite input matching `PROJECT_SPEC.md:203`, or as a 4th displayed sub-score that doesn't affect the composite (see decision below; pick the lower-risk option during implementation).
- The MetricStrip "Active listings" YoY bug is fixed by reading the new aggregate's YoY rather than `median(salePriceYoYs)`.
- Existing per-county data quality issues (Montgomery `153`, Frederick high σ, missing `24510`) are addressed inside this work so the regional chart is correct on first load.

## Architecture Decisions

### Decision: Use only Redfin for active-listings; do not add FRED Realtor.com inventory series

**Why:** Redfin is already ingested, has 14 years of history (vs. 2016-07 for FRED Realtor.com), and exposes companion metrics (`new_listings`, `months_supply`, `days_on_market`) the project will eventually want. Adding a second inventory source would force reconciliation logic for marginal coverage benefit.

**Trade-off:** Project remains dependent on Redfin's TSV staying public and unchanged. Cannot cross-check Redfin numbers against an independent feed.

### Decision: Materialize the DMV total at transform time, mirroring `federal-employment-dmv.json`

**Why:** YoY change requires the full series, not just the latest point — computing it client-side would require fetching all 21 county JSONs just to render one chart, which the existing Home page already does for other reasons but is wasteful for a single regional view. The federal-employment aggregator is a proven pattern in the same file.

**Trade-off:** Adds a new data file the build pipeline must produce. One more thing to break if the transform changes.

### Decision: Fix Redfin name-matching for Baltimore city `24510` in this PR; sum over 20 covered FIPS, gate on full coverage

**Why:** The `buildFipsIndex` helper at `scripts/ingest/redfin.ts:44-56` already strips ` city` for VA independent cities so "Alexandria, VA" matches `51510`; extending the same handling to MD picks up Baltimore city for ~1 line of code. After the fix the aggregate will cover 20 of 21 DMV FIPS — Fairfax city `51600` remains a hard gap (Redfin and FRED Realtor both omit it). The "all counties or skip" gating mirrors the QCEW aggregator (`build-county-pages.ts:365-369`).

**Trade-off:** The historical series will shift upward retroactively from whatever date Redfin started publishing Baltimore city. The aggregate still excludes Fairfax city `51600` (~0.x% of DMV), so the source line must say "DMV total · 20 counties". A future ingest that begins resolving `51600` (e.g. via a Census name-match or a manual override) would create a one-time discontinuity at that boundary.

### Decision: Fix the dedup/period bug in the same PR

**Why:** The Montgomery `153` and Frederick high-σ values will make the new chart visibly wrong (DMV total will appear to crash whenever a weekly row beats a monthly row in the dedup). Cannot ship a regional chart on top of a broken series.

**Trade-off:** Expands scope beyond pure feature work. Mitigation: the fix is small — either (a) preserve `period_duration` on the Observation and prefer monthly in dedup, or (b) drop weekly rows entirely from the active_listings path since the website only uses monthly. Recommend (b) — simpler, and the project elsewhere consumes monthly metrics only.

### Decision: Time range = full history (2012-01 → latest)

**Why:** Matches the federal-employment chart on the same page. Tells a more honest story than the prototype's 36-month window — listings are currently flat YoY but well below pre-pandemic levels, and that is only visible at multi-year scale.

**Trade-off:** Diverges from the prototype's 36-month window and the prototype's "doubled in a year" headline. Need to write a new headline derived from real numbers.

### Decision: Headline copy is computed, not hardcoded

**Why:** Prototype's "Listings have nearly doubled in a year" is stale (current YoY is roughly 0%). Repeating that claim would mislead. The federal-employment card already follows this pattern: `WhatsDriving.tsx:27-30` builds the title from `data.totalYoY`.

**Trade-off:** Card title becomes templated rather than editorial. Mitigation: structure as `"DMV listings ${direction} ${pct} YoY"` with a short subtitle for context.

### Decision: Property-type breakdown on both Home and County charts (stacked area: SFH + condo + townhouse + multi-family)

**Why:** The Redfin cache already carries all five property-type series (`scripts/.cache/redfin.json` series breakdown: `all_residential` 39,353 / `single_family` 39,328 / `townhouse` 38,744 / `condo` 34,426 / `multi_family` 8,585) — the data is free; only the dedup currently discards 4 of them. A stacked area chart shows total inventory and composition simultaneously, and the composition story (DC condos softening, Northern VA SFH tightening) is one of the prototype's core narratives (`claude_design/uploads/04-DMV_CONTEXT.md:33-34`).

**Trade-off:** Sum-of-types is approximately but not exactly equal to Redfin's `all_residential` figure (residual unclassified rows go missing). For internal consistency the chart's "total" should be the **sum of the four stacked types**, not the `all_residential` series, so the visual stacking adds up. The headline callout uses that same sum. Aborting the property-type approach in v1 would let us ship the simpler prototype look, but we'd then have to redo the data layer when we want the breakdown.

### Decision: County page — inventory chart is the last section; also feed inventory YoY into the Market Health card

**Why:** Two complementary placements. (1) The detail chart at the bottom of the page mirrors how DOM and median sale price are already shown — same `AreaChart` styling, same property-type stack as the Home regional chart. (2) `PROJECT_SPEC.md:203` originally specified `inventory YoY 20%` as a market-health input, but the current implementation in `scripts/transform/marketHealth.ts` (consumed by `web/src/components/county/MarketHealthBreakdown.tsx:11-16`) only uses three of the four spec'd inputs. Adding inventory YoY closes the spec gap and reuses the same per-county YoY we already compute for the chart's headline.

**Trade-off:** Touches `marketHealth.ts` weights and tests. The previously published health scores will shift for every county. Mitigation: re-weight to spec (supply 30 / sale-to-list 25 / above-list 20 / inventory YoY 20 = 95; redistribute the missing 5 across remaining inputs or document the gap), and snapshot-test before/after. If reshuffling weights is too noisy in this PR, fall back to keeping current weights and adding inventory YoY as a 4th displayed sub-score that does **not** affect the composite — same UI surface, lower blast radius.

### Decision: Rewire (don't delete) `MetroSnapshot.activeListingsYoY`

**Why:** The "Active listings" tile in `MetricStrip.tsx:58-63` is good UX — only its data wiring is broken. Today `web/src/lib/metro.ts:55` sets `activeListingsYoY: median(salePriceYoYs)`, which renders a meaningless ▲/▼ percent next to the listings count. Pointing the tile at the new aggregate JSON's latest YoY makes the existing UI correct without removing it.

**Trade-off:** `deriveMetroSnapshot()` now needs a third argument (the new aggregate) or `Home.tsx` plumbs the YoY in directly. Either way it adds one prop to one call site.

## Patterns to Follow

- **`DriverCard` shell** (`web/src/components/home/DriverCard.tsx`): kicker / title / callout / chart / source. Reuse exactly; do not introduce a new card variant.
- **AreaChart styling** from `WhatsDriving.tsx:32-54` and `:79-101`: `linearGradient` def, `CartesianGrid stroke="#F4EFE5" vertical={false}`, mono-font ticks formatted `'YY`, tooltip `{ fontSize: 12, fontFamily: 'var(--font-mono)', borderRadius: 8 }`. Use the prototype's color (`#A4243B` stroke, 18% gradient) so the inventory card is visually distinct from federal employment red and mortgage blue.
- **Transform aggregator** at `build-county-pages.ts:354-388` (federal-employment-dmv.json). Copy the structure: build monthly map, gate on full coverage, compute latest + YoY, write to `metrics/`.
- **API loader pattern** at `web/src/api.ts:38-53`: typed interface + dedicated `getActiveListingsDmv()` function.
- **Source string format** from `WhatsDriving.tsx:63`: `"Redfin · DMV total · as of ${asOf}"` — combines source, scope, data date.

### Patterns to Reject

- **Client-side aggregation** (current `MetroSnapshot.activeListings` and `activeListingsYoY` in `web/src/lib/metro.ts`). The latest-value sum stays for the MetricStrip tile, but YoY must come from the new JSON. Do not compute YoY by sorting per-county series in the browser.
- **CBSA `ACTLISCOU47900` as a "DMV total"**. CBSA scope differs from project scope — sum of project FIPS exceeds CBSA by 25–30% in the verified data. Adopting CBSA would silently shrink reported listings.
- **Hardcoded narrative copy**. Prototype's "doubled in a year" is stale; do not preserve it.
- **Adding seasonal adjustment in this PR**. The series is seasonal but federal-employment also is, and the page already accepts that. SA is out of scope.

## Resolved (no remaining open questions)

- **Market Health composite is reweighted** to include inventory YoY at 20%, matching `PROJECT_SPEC.md:203` (months_supply 30 / sale-to-list 30 / above-list 20 / inventory_YoY 20). The `pct_price_drops` input named in the spec is not yet ingested; treat that 0% slot as the existing `pctSoldAboveList` until price-drops lands. Adjust `scripts/transform/marketHealth.ts` and snapshot-test before/after — every county's score will shift, which is expected.
- **Stacked-area chart behavior**: SFH at the bottom of the stack (largest, most stable baseline), condo / townhouse / multi-family layered above in descending order of typical magnitude. Tooltip on hover shows all four type values plus the running total. Legend is static (no click-to-toggle in v1).
- **Aggregate JSON shape**: total + per-type breakdown materialized at both the regional level (`metrics/active-listings-dmv.json`) and per-county level (extension of each `counties/{fips}.json`). Both pages render the same chart component fed by the same shape.

## Research Gaps Affecting Design

- **Redfin name for Baltimore city** in the TSV is unconfirmed (Open Question 1). The fix is small either way, but knowing the exact spelling would let us write it without an exploratory pass during implementation.
- **Redfin TSV `is_seasonally_adjusted` flag at the county level** is unconfirmed. If any DMV county rows arrive with the flag set true, the existing ingester silently mixes SA and NSA values. Project-wide implication; not blocking this card but worth noting.

## Next
**Phase:** Outline
**Artifact to review:** `docs/crispy/regional-inventory/3-design.md`
**Action:** Review decisions and open questions. Then invoke `crispy-outline` with project name `regional-inventory`.
