# Design Brief — DMV Housing

## What we're building

A free, public web dashboard showing housing market data for the Washington, D.C. / Maryland / Virginia metro area, broken down by all 21 counties and independent cities in the metro. The data comes from public agencies (FRED, Census, BLS, Zillow Research, Redfin Data Center) and refreshes automatically.

## Who it's for

A curious adult living in or near the DMV. They might be:

- **A renter wondering if they should buy.** They want a sense of whether prices are stable, rising, or softening, and what they could realistically afford.
- **A homeowner curious about their county.** They want to see their county's trajectory and how it compares to neighbors. They're not selling tomorrow — this is mostly satisfying curiosity and tracking the asset.
- **Someone considering a move within the DMV.** Maybe they live in DC and are thinking about Howard County. They want to compare costs, market dynamics, and trends side by side.
- **A federal employee or contractor watching their economic exposure.** This is a unique DMV cohort. They want to see how federal employment changes are affecting different submarkets.

They are **not** real estate agents, investors, or data analysts. They want clarity, not depth-on-demand.

## What it explicitly is not

- A listings site. We do not show individual properties.
- A "find your dream home" funnel. There is no agent-finder, no mortgage-application CTA, no email capture.
- A tool for active negotiation. The data is monthly-to-annual cadence; weekly at the fastest.
- An analytics platform. There is no SQL, no custom queries, no exports beyond what's visible.

## Core jobs to be done

In rough priority order:

1. **"What's the market doing in my county right now?"** Single county view with current snapshot and historical context.
2. **"How does my county compare to others?"** Multi-county comparison.
3. **"What's happening across the DMV?"** Metro-level overview with the geographic split visible.
4. **"Can I afford to buy here?"** Affordability calculator that respects local property tax and current mortgage rates.
5. **"Where is the market going?"** Forecast view that surfaces uncertainty rather than hiding it behind a single number.

## Design principles

### 1. Numbers are the product

The site exists to communicate numbers. Numbers must be:
- Large enough to read at a glance from arm's length
- Tabular-aligned so vertical comparisons work
- Always accompanied by a unit and a time reference
- Always accompanied by year-over-year context where relevant

### 2. Color is meaningful, never decorative

We use color to encode information:
- Direction (up/down vs. prior period)
- Jurisdiction (DC / MD / VA)
- Health (good / neutral / concerning on market-health metrics)

We do not use color for hierarchy, branding flourish, or "making it pop."

### 3. Trust is built by transparency, not polish

The design must look credible to someone who reads The Economist, not to someone optimizing for app-store screenshots. That means:
- Every chart shows its source.
- Every number shows its as-of date.
- When data is missing, we say so — we don't interpolate or hide.
- When forecasts are involved, the cone of uncertainty is the visualization, not the median line.

### 4. The DMV's idiosyncrasies are features

This metro is unlike any other in the U.S. Three forces define it right now:

- **Federal employment contraction** is reshaping demand in close-in DC, federal-commuter exurbs (Calvert, Spotsylvania, Charles), and the rental market.
- **The Northern Virginia data center boom** has made Loudoun County the highest-income county in the U.S. and is rewriting Prince William and Fauquier real estate.
- **A sharp affordability split** between Howard/Loudoun/Fairfax/Arlington (chronically tight) and DC condos / outer suburbs (softening).

The design should make these contrasts visible. A single "DMV median price" number hides the story; a map and a comparison view reveal it.

### 5. Mobile is for browsing; desktop is for studying

Phone use case: someone reads a news article, gets curious, taps a link, glances at their county. They should get the answer in 10 seconds.

Desktop use case: someone settles in, compares 4 counties, plays with the affordability calculator, reads the federal-exposure panel.

The design should serve both without compromising either. The Compare page can be tablet-and-up.

## Tone of voice

- **Plain.** "Median sale price," not "MSP" or "Med. SP."
- **Calm.** Avoid superlatives, exclamation marks, urgency. The data is what it is.
- **Specific.** "Source: FRED series ATNHPIUS24031A, updated 2026-04-15" beats "Latest data."
- **Honest about uncertainty.** "Forecasters disagree. Bright MLS expects -1%, Zillow expects -0.7%, NAR expects +1.5%" beats "Prices expected to fall."

## Reference points

### Aesthetic touchstones (channel these)

- **FRED** (fred.stlouisfed.org) — credibility, chart-density, government-data-portal vibe done well
- **Stripe documentation** — restraint in typography, generous spacing, calm
- **The Pudding** — narrative data journalism that respects the reader
- **Apple Maps** desktop view — restrained color, clear hierarchy

### Aesthetic anti-patterns (avoid)

- **Zillow, Redfin, Realtor.com** — the consumer-real-estate idiom, hero photos, agent CTAs
- **Generic SaaS dashboard** — purple gradients, abstract 3D illustrations, "Get Started" CTAs
- **Dribbble** — beautiful, unbuildable, optimized for screenshots not for users

## Out of scope for v1

These exist in the long-term plan but should not appear in your designs:

- User accounts, saved searches, favorites
- Email alerts
- Property-level data
- Listing search
- Realtor / lender directory
- Embedded ads of any kind
- Cookie-based personalization
