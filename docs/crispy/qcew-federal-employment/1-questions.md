# Questions

### QCEW data source basics
1. What is QCEW, who publishes it, and what is its release cadence?
2. What is the geographic granularity of QCEW (national, state, MSA, county, sub-county)?
3. What time lag exists between a covered quarter and the public release of that quarter's data?
4. What measures does QCEW report per series (employment level, total wages, average weekly wage, establishment count, etc.) and what are their units?

### Access mechanisms and licensing
5. What public APIs, bulk file endpoints, or flat-file downloads does the BLS provide for QCEW, and what authentication or registration is required?
6. What are the documented rate limits, file size ranges, and recommended retrieval patterns for each access mechanism?
7. What licensing or attribution requirements apply to redistributing QCEW values in a derived product?

### Series identifiers and schema
8. How are QCEW series identifiers structured (area code, ownership code, industry code, size code, datatype code), and how do they map to a county FIPS?
9. Which ownership code(s) correspond specifically to federal government employment, and how do they differ from state, local, and private ownership?
10. Which NAICS aggregation levels are available, and which level represents "all industries / total covered" employment?
11. How are suppressed or non-disclosable cells represented in the data, and how frequently do they occur at the county × federal-ownership intersection?

### County coverage in the DMV
12. Which county-equivalent FIPS codes exist in DC, Maryland, and Virginia (including independent cities), and are all of them represented in QCEW with federal-ownership rows?
13. Are there known coverage gaps, code changes, or boundary adjustments (e.g., independent city consolidations) that affect QCEW historical continuity in the DMV?

### Comparison with adjacent BLS datasets
14. How does QCEW differ from CES (Current Employment Statistics) and LAU (Local Area Unemployment) in terms of what is counted, who is excluded, and at what geography?
15. Does FRED republish QCEW county × federal-ownership series, and if so under what series ID conventions?

### Repository conventions
16. What ingester pattern, type definitions (`Observation`, `MetricId`), and transform shape (`CountySummary`) does this codebase already use, and where would a new QCEW source plug in?
17. What existing metric IDs or BLS-derived series already live in `shared/types.ts` and `web/public/data/`, and is there prior art for ownership-segmented employment series?

## Next
**Phase:** Research
**Artifact to review:** `docs/crispy/qcew-federal-employment/1-questions.md`
**Action:** Review and edit questions if needed. Then **start a fresh session** and invoke `crispy-research` with project name `qcew-federal-employment`.
⚠️ A fresh session is required so research is objective and unbiased by task knowledge.
