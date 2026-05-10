# DMV boundary options

The set of jurisdictions in `shared/src/counties.ts` (`DMV_COUNTIES`) does not match any single published OMB boundary. This document frames the tradeoffs so the project owner can pick a boundary in a future cycle. **No code changes are made by this document.**

For background see `docs/crispy/validate-public-data/2-research.md` Q1.

## Status quo (current `DMV_COUNTIES`, 21 jurisdictions)

DC (1): `11001`.
MD (9): `24003 Anne Arundel`, `24005 Baltimore Co.`, `24009 Calvert`, `24017 Charles`, `24021 Frederick`, `24027 Howard`, `24031 Montgomery`, `24033 Prince George's`, `24510 Baltimore city`.
VA (11): `51013 Arlington`, `51059 Fairfax`, `51107 Loudoun`, `51153 Prince William`, `51177 Spotsylvania`, `51179 Stafford`, `51510 Alexandria city`, `51600 Fairfax city`, `51610 Falls Church city`, `51683 Manassas city`, `51685 Manassas Park city`.

Conflicts with both candidate published boundaries below: includes 4 Baltimore-area MD jurisdictions, omits 7 OMB MSA jurisdictions.

## Option A — keep status quo

**What:** No FIPS list change. Update `ARCHITECTURE.md` to declare the chosen boundary as "DMV Hub working set: DC + MD-Wash + MD-Baltimore-area + Northern VA suburbs and independent cities."

**Pros:**
- Zero churn. Existing data files, choropleth viewport, county pages all keep working.
- Includes the Baltimore-area counties that many DMV residents and movers care about (Howard, Anne Arundel, Baltimore Co.).
- Coverage across all 21 FIPS is already validated for FRED, Census, BLS, QCEW, and Zillow. Redfin coverage is sparse on 7 small jurisdictions but already accommodated via `coverage.missing` (see Slice 3).

**Cons:**
- Not externally cross-checkable against any single published boundary.
- "DMV" branding diluted by Baltimore-area inclusion.
- Doesn't cleanly map to MWCOG, Bright MLS regional reports, or Stephen S. Fuller Institute analyses.

## Option B — Wash-Arl-Alex MSA (CBSA 47900, 24 jurisdictions)

**What:** Adopt OMB Bulletin 23-01 (July 2023) MSA membership.

Add: `51061 Fauquier`, `51047 Culpeper`, `51187 Warren`, `51043 Clarke`, `51157 Rappahannock`, `51630 Fredericksburg city`, `54037 Jefferson WV`.

Remove: `24003 Anne Arundel`, `24005 Baltimore Co.`, `24009 Calvert`, `24027 Howard`, `24510 Baltimore city`.

**Pros:**
- Canonical: matches FRED's MSA-level series, every BLS regional release for "Wash MSA," and most academic DMV analysis.
- Easy cross-check with Bright MLS Washington-DC-Metro and Stephen S. Fuller Institute reports.
- "DMV" branding is on stronger footing.

**Cons:**
- Loses Baltimore-area data — a non-trivial cohort of users.
- Adds 7 small Virginia counties (Fauquier/Culpeper/Warren/Clarke/Rappahannock/Fredericksburg) where Redfin and Zillow coverage is sparse to absent. Net effect on per-source coverage:
  - FRED FHFA HPI: covered for all 24.
  - Zillow ZHVI: covered for the larger jurisdictions; sparse for Rappahannock, Clarke, Warren.
  - Redfin: very sparse for Rappahannock, Clarke; intermittent for Warren, Culpeper, Fauquier.
  - QCEW + LAUS + Census: all covered.
- Adds Jefferson Co. WV, which is not currently in any of our state-FIPS-prefix routing logic (`stateFips: '11' | '24' | '51'`). Adding it would require widening the type union.

## Option C — Wash-Baltimore CSA (CSA 548, ~38 jurisdictions)

**What:** Superset: Wash-Arl-Alex MSA + Baltimore-Columbia-Towson MSA + a few smaller surrounding metros.

Includes everything in A and B, plus: `24013 Carroll`, `24025 Harford`, `24035 Queen Anne's`, etc. on the MD side.

**Pros:**
- Broadest demographic catchment; includes both the federal-jobs commute shed (DC + suburbs) and the Baltimore commute shed.
- Internally consistent (Census publishes population/economic CSA aggregates).

**Cons:**
- CSAs are less commonly used in housing reporting than MSAs — most published DMV-region housing data uses MSA-47900 framing.
- Baltimore market dynamics differ enough from DC that aggregating the two dilutes the analytical value of every "DMV-wide" chart.
- ~38 jurisdictions × monthly Redfin pulls × multiple property types is a meaningful cache-size and transform-cost increase.
- Branding mismatch: nobody calls Anne Arundel + Howard + Carroll + Harford "the DMV."

## Per-source coverage matrix

| | A (status quo) | B (MSA 47900) | C (CSA 548) |
|---|---|---|---|
| FRED FHFA HPI | full | full | full |
| FRED MSA-level series | partial (Wash MSA covers some) | full | partial (Wash + Balt MSA) |
| Census ACS | full | full | full |
| BLS LAUS | full | full | full |
| BLS QCEW | full | full | full |
| Zillow ZHVI county | full | sparse for 3 small VA cos. | sparse for same 3 plus a few rural MD |
| Zillow ZHVI metro | partial (covers Wash + Balt) | full (Wash MSA only) | full (Wash + Balt MSAs) |
| Redfin TSV | sparse for 7 small VA cos. | sparse for 5 small VA cos. | sparse for 7+ small cos. |

## Recommendation (pending owner sign-off)

**Option B, with one carve-out**: adopt MSA-47900 as the primary boundary, but keep Howard County (24027) as an honorary inclusion because (a) it sits between DC and Baltimore and is part of the BWP "Capital Region" framing, and (b) it has full coverage from every source. This gives 25 jurisdictions: the 24 OMB MSA members plus Howard.

Rationale: the canonical OMB list gives us external cross-checkability, the Howard carve-out preserves a high-value Baltimore-suburb that many users associate with DC. Anne Arundel/Baltimore Co./Baltimore city/Calvert get dropped — the loss is real but they have natural homes in the Baltimore-MSA-focused dashboards published elsewhere.

If the owner prefers strict canonicality (no carve-outs) → pick Option B as-is.
If the owner prefers status-quo continuity → pick Option A and document the boundary in `ARCHITECTURE.md`.

Cross-references: `ARCHITECTURE.md` should gain a "DMV boundary" section pointing here once a decision is made.
