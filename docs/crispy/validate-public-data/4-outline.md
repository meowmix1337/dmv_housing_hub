# Outline

Eight vertical slices, ordered so each builds on the last. Slices 1–3 are foundations: docs, types, and provenance. Slices 4–6 are user-visible accuracy fixes. Slices 7–8 close the loop on boundary policy and verification practice.

## Slice 1 — Spot-check workflow in `DATA_SOURCES.md`

**Goal:** Document the verification process so any human or AI agent landing in the repo knows where and how to spot-check each ingester against its upstream source — *before* any code change ships.

**Components:**
- New `## Verification` section in `DATA_SOURCES.md` with one subsection per source (`fred`, `census`, `bls`, `zillow`, `redfin`, `qcew`).
- Each subsection lists: spot-check URL, sentinel FIPS (DC `11001`, Montgomery `24031`, Fairfax `51059`, Falls Church `51610`), what to compare, and a `Last verified: YYYY-MM-DD` line.
- A short "When to verify" rubric: at every monthly ingest, on any ingester change, on any methodology change at the upstream source.

**Checkpoint:** A reviewer can pick any of the six sources, follow the documented URL, and reach the upstream-published value being checked, without prior context.

## Slice 2 — Extend `Observation` and `ManifestSourceEntry` with provenance fields

**Goal:** Give every value a place to carry margin-of-error and "last verified" metadata without changing existing consumers.

**Components:**
- `Observation` adds optional `moe?: number` (default omitted).
- `ManifestSourceEntry` adds optional `lastVerified?: string` (ISO date).
- `manifest.json` builder reads `lastVerified` from `DATA_SOURCES.md` headings (or from a small `verification.json` adjacent to the source code) and emits it.

**Checkpoint:** `npm run build` passes with no behavioral change. Existing JSON outputs are byte-identical except the new optional manifest field.

## Slice 3 — DMV aggregate provenance labels

**Goal:** Make `active-listings-dmv.json` and `federal-employment-dmv.json` self-describe as in-repo sums, not upstream-published aggregates.

**Components:**
- `ActiveListingsDmv` and `FederalEmploymentDmv` interfaces in `shared/src/types.ts` gain `aggregation: 'in-repo county sum'` and `contributingFips: string[]`.
- `build-county-pages.ts` populates these fields from `DMV_COUNTIES` plus the FIPS that actually had data (so the count reflects coverage, not just intent).
- A `coverage.missing` field on each aggregate names FIPS that had no upstream data this cycle (already on `ActiveListingsDmv`, ensure it is populated and propagate to the federal-employment aggregate).

**Checkpoint:** The two aggregate JSONs declare their nature explicitly; a reviewer reading the file can answer "is this from Redfin/QCEW directly, or computed?" without reading any code.

## Slice 4 — ACS refresh to 2020–2024 + MOE capture

**Goal:** Pull the latest ACS vintage and start carrying margins of error end-to-end.

**Components:**
- `scripts/ingest/census.ts`: bump `ACS_YEAR` to `2024`, update `BASE_URL`, set `OBSERVED_AT = '2024-01-01'`.
- Extend the variable list to also fetch `_001M` (MOE) for each `_001E` estimate; populate `Observation.moe`.
- `scripts/ingest/census.test.ts` updates to cover the MOE path.
- Re-run ingest+transform; commit the refreshed `web/public/data/counties/*.json` and `metrics/*.json`.

**Checkpoint:** Spot-check 4 sentinel FIPS against `data.census.gov` 2020–2024 ACS B19013/B25077/B25064 values within a $1 rounding tolerance. MOE is captured on the observation but **not** rendered in the UI yet (display deferred to Slice 6 if scoped).

## Slice 5 — Replace `affordabilityIndex` with NAR HAI

**Goal:** Surface a publicly recognizable affordability number aligned with NAR's convention.

**Components:**
- Rewrite `scripts/transform/affordability.ts`:
  - `qualifyingIncome = monthlyPI × 4 × 12`, `monthlyPI` from 80%-LTV 30-year-fixed at the latest PMMS rate (no tax/insurance).
  - `HAI = (medianHouseholdIncome / qualifyingIncome) × 100`.
- Update `affordability.test.ts` with NAR-aligned test vectors (e.g. HAI ≈ 100 when household income exactly matches qualifying income).
- Update `CountyCurrentSnapshot.affordabilityIndex` JSDoc to state the NAR convention and the household-vs-family-income substitution.
- Update any web component label that displays this value (likely in `web/src/components/MetricCard.tsx` or similar).
- Add a one-line note in `DATA_SOURCES.md` Verification section pointing to NAR's HAI methodology page.

**Checkpoint:** Spot-check one sentinel FIPS HAI against NAR's published methodology by hand-recomputing with current values; result within ±5% of the in-repo value (some divergence is expected because we use household, not family, income).

## Slice 6 — Per-source citation UI + freshness banner

**Goal:** Every chart and snapshot value names its source and "as of" date; the page header surfaces overall freshness.

**Components:**
- New `web/src/data/citations.ts` keyed by `MetricId` → `{ source: string; url: string; methodologyUrl?: string }`.
- New `<SourceLine />` component that renders "Source: FRED (FHFA HPI), as of 2025-01-01" beneath each chart and snapshot card.
- New `<FreshnessBanner />` driven by `manifest.json`; visible only when any source is `>30 days` past its expected cadence.
- Decision on `marketHealthScore`: relabel UI to "DMV Hub Composite Score" with a tooltip showing the four-input formula. Field name unchanged for now (rename deferred — see Open Questions).

**Checkpoint:** Visit `/`, `/county/11001`, and `/compare` in `npm run dev`; confirm every numeric value shows a source line, every chart shows source + as-of, and the freshness banner is hidden when all sources are fresh.

## Slice 7 — DMV boundary options doc

**Goal:** Frame the boundary tradeoffs so the project owner can decide in a follow-up cycle without prejudice.

**Components:**
- New `docs/dmv-boundary-options.md` comparing three candidates:
  1. Current 21-jurisdiction list (status quo)
  2. MSA-47900 (Wash-Arl-Alex MSA, 24 jurisdictions, OMB 2023)
  3. CSA-548 (Wash + Baltimore CSA, 38 jurisdictions)
- Per candidate: per-source data coverage (FRED/Zillow/Redfin/QCEW), aggregate-size impact, choropleth viewport implications, downstream-doc-change cost.
- A recommended option with a short rationale; explicitly note this is a *recommendation*, not a decision, pending owner sign-off.

**Checkpoint:** Owner can read the doc once and pick a boundary; no code changes ship in this slice.

## Slice 8 — Initial spot-check pass v1

**Goal:** Execute the Slice 1 workflow once against the now-refreshed data; record results.

**Components:**
- Manually verify each of the 6 sources at the 4 sentinel FIPS using the URLs in `DATA_SOURCES.md` Verification section.
- Stamp `lastVerified` per source in `verification.json` (or wherever Slice 2 chose to source it from).
- For any discrepancy: open a GitHub issue with FIPS + metric + in-repo value + upstream value + URL + timestamp; do not silently overwrite.

**Checkpoint:** `manifest.json` shows `lastVerified` populated for all six sources within the past 7 days. Any open discrepancies are tracked as issues, not mutations.

---

## Key Interfaces

```ts
// shared/src/types.ts — additive changes

interface Observation {
  // existing fields…
  moe?: number; // ACS-style margin of error at 90% CI; absent for sources that don't publish MOE
}

interface ManifestSourceEntry {
  // existing fields…
  lastVerified?: string; // ISO date; populated from DATA_SOURCES.md Verification section
}

interface ActiveListingsDmv {
  // existing fields…
  aggregation: 'in-repo county sum';
  contributingFips: string[]; // FIPS that supplied at least one data point this cycle
  // coverage.missing already exists; ensure it lists FIPS with no data
}

interface FederalEmploymentDmv {
  // new shape mirroring ActiveListingsDmv
  aggregation: 'in-repo county sum';
  contributingFips: string[];
  coverage: { fips: string[]; missing: string[] };
  // …existing fields
}
```

```ts
// web/src/data/citations.ts — new

interface SourceCitation {
  source: 'fred' | 'census' | 'bls' | 'qcew' | 'zillow' | 'redfin';
  label: string;        // "FRED (FHFA All-Transactions HPI)"
  url: string;          // upstream landing page
  methodologyUrl?: string;
}

const CITATIONS: Record<MetricId, SourceCitation>;
```

```md
<!-- DATA_SOURCES.md — new section per source -->

### Verification: <source>
- Spot-check URL: <url>
- Sentinel FIPS: 11001, 24031, 51059, 51610
- What to compare: <metric description>
- Last verified: YYYY-MM-DD
```

## Next
**Phase:** Plan
**Artifact to review:** `docs/crispy/validate-public-data/4-outline.md`
**Action:** Review the vertical slices and checkpoints. Then invoke `crispy-plan` with project name `validate-public-data`.
