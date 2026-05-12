# Questions

### FIPS coverage and jurisdictional definitions

1. What is the authoritative list of county-equivalent FIPS codes that comprise the District of Columbia, Maryland (the Washington-Arlington-Alexandria portion), and Northern Virginia for purposes of the "DMV" region, and what source defines that boundary?
2. For Virginia independent cities (e.g. Alexandria 51510, Fairfax City 51600, Falls Church 51610, Manassas 51683, Manassas Park 51685), how do federal data providers (FRED, Census, BLS, FHFA, Zillow, Redfin) treat them — separately, merged with the surrounding county, or omitted?
3. Which Maryland and Virginia counties are officially part of the Washington-Arlington-Alexandria MSA per OMB's most recent delineation, and how does that compare to the FIPS list under `web/public/data/counties/`?

### FHFA House Price Index (HPI)

4. What is the official release cadence, geographic granularity (county vs. metro vs. state), and base period (index = 100) for the FHFA All-Transactions House Price Index, and what are the known limitations (e.g. coverage of cash sales, new construction)?
5. For each DMV county FIPS, what is the FRED series ID and the latest published annual value of the FHFA HPI as of 2026-05, and how does it compare to the values stored in `web/public/data/counties/{fips}.json` under `series.fhfaHpi`?
6. How is "HPI YoY" conventionally calculated by FHFA and FRED — percentage change of annual index values, of quarterly values, or of a 4-quarter rolling mean?

### Zillow Home Value Index (ZHVI)

7. What is the official definition, methodology, smoothing approach, and geographic coverage of Zillow's ZHVI (Smoothed, Seasonally Adjusted) at the county level, and how often is it republished or revised?
8. For each DMV county, what is the most recent ZHVI value published by Zillow Research, and does it match the `current.zhvi` field in the corresponding county JSON within ±1%?
9. Does Zillow publish ZHVI for all DMV jurisdictions including small Virginia independent cities, and where coverage is missing, what fallback (if any) is documented?

### Redfin Data Center (active listings, sale price, DOM, sale-to-list, sold-above-list)

10. What is Redfin's documented methodology for `median_sale_price`, `active_listings`, `median_days_on_market`, `months_of_supply`, `avg_sale_to_list`, and `pct_sold_above_list`, and at what geographic granularity (county, metro, state) are they published?
11. What property-type categories does Redfin's weekly/monthly market data file expose, and how do "single_family", "condo", "townhouse", and "multi_family" map to those categories?
12. What is Redfin's published value for active listings in the DMV region (or its constituent counties) for the month ending 2026-03-31, and how does it compare to the 16,882 total figure in `metrics/active-listings-dmv.json`?
13. How does Redfin handle missing or suppressed county-level rows (small counties with low transaction counts), and is the suppression policy documented?

### BLS / QCEW federal employment

14. What does QCEW define as "federal government" employment (NAICS code, ownership code), at what geographic granularity it is published, and what is the typical lag between reference quarter and publication?
15. What is the latest published QCEW federal-government employment count for each DMV county and for the DMV aggregate as of Q3 2025 (reference 2025-09-01), and how does it compare to the 387,475 total in `metrics/federal-employment-dmv.json`?
16. How does QCEW treat federal employees who work in DC but live in MD/VA (or vice versa) — is the count by place of work or place of residence, and does this affect cross-jurisdiction comparisons?

### BLS Local Area Unemployment Statistics (LAUS)

17. What geographic level (county, MSA, state) does BLS LAUS publish unemployment rates for, what is the seasonal-adjustment status of county-level series, and what is the current data lag?
18. What is the BLS-reported unemployment rate for each DMV county for the most recent month available as of 2026-05, and does it match `current.unemploymentRate` in each county JSON?

### Census / ACS demographics and housing

19. Which ACS table(s) and vintage(s) are typically used for county-level median household income, median home value, owner-occupancy rate, and population, and what is the margin-of-error reporting requirement?
20. For each DMV county, how do ACS 5-year (2019–2023 or 2020–2024) values for median household income and owner-occupancy compare to the values represented in the county summary JSONs?

### Mortgage rates (FRED)

21. What FRED series (e.g. MORTGAGE30US — Freddie Mac PMMS) underlies the mortgage-rates dataset, what is its publication cadence, and what is the most recent value as of 2026-05?
22. How does FRED's MORTGAGE30US compare to alternative national 30-year fixed averages published by Mortgage News Daily, Bankrate, or the MBA, and what known biases exist?

### Derived / composite metrics

23. How is a "market health score" conventionally constructed in public real-estate dashboards (e.g. Zillow Market Health, Realtor.com Market Hotness), and what specific inputs and weights does the score in `current.marketHealthScore` use?
24. How is an "affordability index" conventionally defined (e.g. NAR Housing Affordability Index uses median income vs. qualifying income at prevailing mortgage rate), and what inputs and formula produce the `current.affordabilityIndex` value?
25. What is the standard formula for "months of supply" in real-estate reporting (active listings ÷ closed sales per month, or pending vs. closed), and which variant does Redfin publish?

### Freshness, revisions, and citation

26. What is the documented revision policy for each upstream source (FRED, BLS, Census, FHFA, Zillow, Redfin) — how often are historical values revised, and how should a downstream consumer flag potentially-revised data?
27. What citation/attribution requirements do FRED, BLS, Census, FHFA, Zillow, and Redfin each impose on derivative public dashboards, and what is industry-standard practice for source attribution UX?
28. What public dashboards or reports (e.g. Greater Washington Partnership, Stephen S. Fuller Institute, MWCOG, Virginia REALTORS, Bright MLS, MarylandREALTORS) publish DMV-region housing aggregates that can serve as independent cross-checks?

## Next
**Phase:** Research
**Artifact to review:** `docs/crispy/validate-public-data/1-questions.md`
**Action:** Review and edit questions if needed. Then **start a fresh session** and invoke `crispy-research` with project name `validate-public-data`.
⚠️ A fresh session is required so research is objective and unbiased by task knowledge.
