# Questions

### Data sources & coverage
1. Which public datasets publish for-sale housing inventory at the county level for DC, MD, and VA, and what is the latest available month for each?
2. What metrics do those datasets expose (active listings, new listings, pending, months of supply, days on market, price reductions), and how are each defined?
3. What is the historical depth of each inventory dataset (earliest available month) and what is the publishing cadence and typical lag?
4. Which counties in the DMV (DC + MD + VA portions) are missing or suppressed in each inventory dataset, and what are the suppression rules?
5. What licensing/attribution requirements apply when redistributing inventory time series from each source?

### Existing project state
6. Where in the current ingest pipeline is county-level active listings data being captured today, and what `MetricId`(s) and source identifiers are used?
7. What does the current `CountySummary` JSON shape contain related to inventory, and which web components consume those fields?
8. Where is the existing "Regional inventory chart coming soon" placeholder rendered, and what file/component owns the market health section?
9. What other metrics live in the market health section today, and what visual/interaction patterns do they use (chart type, time range controls, tooltips, citations)?
10. How are existing regional/aggregate time series (national or metro-level) currently produced — is there a transform step that aggregates county observations, or are regional series ingested directly from upstream?

### Aggregation & methodology
11. When upstream sources publish both county-level and metro/regional inventory, how do their reported regional totals compare to the sum of underlying counties (gaps, double-counting across overlapping CBSAs)?
12. What standard methodologies exist for aggregating county active-listings counts into a regional total (simple sum, population-weighted, coverage-adjusted), and what assumptions does each make?
13. How do upstream sources handle seasonality in inventory series — are SA (seasonally adjusted) variants published, and over what window?
14. What is the typical month-over-month and year-over-year volatility of active listings in DMV counties, and which counties dominate the regional total by volume?

### Prototype & design
15. Where does the prototype design for inventory live (file path, Figma link, or repo location), and what charts, panels, and county-detail elements does it specify?
16. What chart types, time ranges, and comparison affordances does the prototype prescribe for the regional view versus the per-county view?
17. What citation/footer patterns does the prototype use for source attribution and "last updated" timestamps?

## Next
**Phase:** Research
**Artifact to review:** `docs/crispy/regional-inventory/1-questions.md`
**Action:** Review and edit questions if needed. Then **start a fresh session** and invoke `crispy-research` with project name `regional-inventory`.
⚠️ A fresh session is required so research is objective and unbiased by task knowledge.
