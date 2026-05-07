# DMV Market Context

What makes the Washington / Maryland / Virginia metro idiosyncratic, and how the design should make these forces visible.

## Three forces shape the market right now

### 1. Federal employment contraction

The DMV ended 2025 down 56,000–72,000 federal jobs year-over-year — the largest absolute decline of any U.S. metro. Per Brookings, federal employment in the region shrank ~14% in 2025, and roughly 96% of total job losses in the metro traced back to federal cuts.

The effect on housing is uneven:

- **DC proper** is bearing the brunt. ZHVI is down 4.2% YoY, the only major DMV jurisdiction in clearly negative territory. Listings hit the highest level since 2022. The DC CFO is projecting a ~$342M annual revenue shortfall through FY2028.
- **Federal-commuter exurbs** (Calvert, Spotsylvania, Charles, parts of Stafford and Prince William) are softening. Bright MLS specifically named Calvert and Spotsylvania as weak hyper-local markets in their 2026 forecast.
- **Close-in, federal-adjacent jurisdictions** (Montgomery, Fairfax, Arlington) are mostly holding; the high-income workforce is more resilient and still has demand.

This is the single most important framing for the DMV right now. **No other major metro has this exposure.** A "U.S. housing market" article cannot tell this story; this site can.

### 2. The Northern Virginia data center boom

Loudoun County hosts ~73% of its commercial property tax base in data centers. The boom has:

- Made Loudoun the **highest-income county in the United States** (median household income ~$170K)
- Lowered residential property taxes there by $0.48/$100 since 2012
- Pushed up Loudoun land prices ~45%, Prince William ~38%, with hyperscale tech (AWS, Microsoft, Google) buying parcels for new sites

The market story: even as DC softens, Loudoun and Prince William have an entirely different demand engine. Residential housing there is supported by tech salaries, not federal salaries. Designs should make this contrast visible — these counties don't move with DC.

### 3. The supply-side affordability split

Two markets coexist in the metro:

- **Tight markets**: Howard (1.1 months supply), Loudoun (~1.9), Falls Church, Fairfax County, Fairfax City, Anne Arundel. Inventory is chronically below 2 months. Buyers compete; sellers get list price or above.
- **Soft markets**: DC condos (6+ months), Calvert, Spotsylvania, Alexandria condos, parts of Stafford and Charles. Inventory is rising; sellers reduce.

A single "DMV median" averages these and tells nobody anything. The design must **let users pick a county and see their reality**, and let them compare across the split.

## What the data says, as of late April 2026

- 30-year fixed mortgage rate: **6.23%** (down from 6.81% a year ago — lowest in three spring seasons)
- DMV metro median price 2025: **$623,140**
- DMV metro median price 2026 forecast (Bright MLS): **$616,700** (-1.0%)
- DMV metro median price 2026 forecast (Zillow DC): **-0.7%**
- DMV metro median price 2026 forecast (NAR national, applied to metro): **+1.5%**

Note the spread between forecasters (-1% to +1.5%) — that's the cone of uncertainty users should see, not a single point.

## Storytelling angles the design should support

### "What's driving the market" cards (Home page)

Short narrative cards that surface the forces above. Suggested set:

1. **Federal employment** — chart of metro federal employment over the last 3 years, with a callout: "down ~14% in 2025." Link to a per-county "federal exposure" view.
2. **Mortgage rates** — sparkline of the 30Y rate over the last 24 months. Callout: "Lowest in three spring seasons."
3. **Inventory normalizing** — chart of metro active listings. Callout: "~2× a year ago, but still below pre-pandemic norms."
4. **The county split** — a small bar showing top 3 strongest markets vs. bottom 3 weakest, by 2026 outlook. Callout: "Loudoun and Howard tightest; DC condos and Calvert softest."

Each card should be readable in 5 seconds and link somewhere with more depth.

### "Federal exposure" panel (County page)

For each county, show:
- % of jobs that are federal (BLS QCEW data)
- Federal employment trend, last 24 months
- Optional: a single-sentence interpretation if the exposure is high ("~28% of Calvert County jobs are tied to federal employment, the highest in the MD portion of the DMV")

This panel won't appear elsewhere (no other dashboard has it). It's a key differentiator.

### Forecast cone (County page)

When showing 2026 forecasts, three forecasters disagree. Don't average them and show a line — show **three points or a fan**, with each forecaster labeled. The user's takeaway should be: "Forecasters expect somewhere between -1% and +2.7%. The honest answer is: nobody knows." That's more useful than false precision.

### Affordability calculator (County page)

The DMV has an unusual affordability picture: high incomes, very high prices, and a property tax / personal property tax structure that varies by jurisdiction. The calculator should:

- Take income, down payment %, mortgage rate as inputs (sliders)
- Use the *correct property tax rate for that specific county* (the rates vary from 0.85% in DC to 1.97% in Baltimore City)
- Output: monthly payment, % of income, comparison to "30% rule"
- Show the all-in monthly cost as a percentage of the user's income, color-coded against the 30% rule

This is more honest than a generic "what can you afford" calculator that ignores local taxes.

## What the design must NOT do

- **Don't average DC into "the DMV"** in a way that hides its softness. The metro has multiple stories.
- **Don't show forecasts as single numbers.** Show ranges or multiple forecasters. The uncertainty is real.
- **Don't conflate federal exposure with weakness.** Some federally-exposed counties (Anne Arundel with NSA) are *stable* because the agency isn't being cut. The design should distinguish "federally exposed" from "federally at risk."
- **Don't editorialize politically.** The federal layoffs are politically charged. The site presents them as economic data without commentary on whether they're good or bad.

## What the design CAN highlight that other tools don't

- The metro's **internal divergence** — making the split between tight and soft markets visible at a glance.
- **Federal exposure** as a first-class metric.
- **Forecast disagreement** as an honest framing.
- **Local property tax differences** — DC's 0.85% vs Baltimore City's 1.97% is a 2.3× difference that affects affordability dramatically.
- **The data center effect** in Loudoun and Prince William — most national tools don't surface this.

These are the things a thoughtful, locally-aware dashboard can do that Zillow and Redfin will not.
