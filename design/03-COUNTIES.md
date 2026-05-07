# DMV Counties

The 21 jurisdictions covered. Use these names exactly. The shortName is the version that fits in tight UI (chart legends, choropleth tooltips, filters).

## District of Columbia

| FIPS | Name | shortName | Notes |
|---|---|---|---|
| 11001 | District of Columbia | DC | Soft 2025–26 due to federal layoffs; condo overhang. Highest $/sqft in metro. |

## Maryland (9 jurisdictions)

| FIPS | Name | shortName | Notes |
|---|---|---|---|
| 24003 | Anne Arundel County | Anne Arundel | Annapolis, Fort Meade / NSA anchors. Stable. |
| 24005 | Baltimore County | Baltimore Co. | Suburban, distinct from Baltimore City. |
| 24009 | Calvert County | Calvert | Federal exurban commuter; flagged as a *weak* market in 2026 forecast. |
| 24017 | Charles County | Charles | Bears federal-commuter weakness. Active multifamily construction. |
| 24021 | Frederick County | Frederick | Fastest-growing MD county; Fort Detrick employment base. |
| 24027 | Howard County | Howard | Tightest market in metro; chronic supply shortage; APL/JHU employment. |
| 24031 | Montgomery County | Montgomery | NIH/FDA. Diverse, large county. **Use as design exemplar.** |
| 24033 | Prince George's County | Prince George's | Most affordable inner suburb. UMD anchor. Median $440K. |
| 24510 | Baltimore city | Baltimore City | Independent city. Most affordable major jurisdiction. |

## Virginia (11 jurisdictions, including 5 independent cities)

| FIPS | Name | shortName | Notes |
|---|---|---|---|
| 51013 | Arlington County | Arlington | Amazon HQ2; highest $/sqft after DC. |
| 51059 | Fairfax County | Fairfax | Largest NoVA county. Capital One, Booz Allen. |
| 51107 | Loudoun County | Loudoun | **Highest household income in U.S.** (~$170K). Data center boom. |
| 51153 | Prince William County | Prince William | Federal worker resource hub launched 2025. Mixed market. |
| 51177 | Spotsylvania County | Spotsylvania | Federal exurban commuter; flagged as *weak* market in 2026 forecast. |
| 51179 | Stafford County | Stafford | Quantico/Pentagon commuters. |
| 51510 | Alexandria city | Alexandria | Independent city. Strong condo overhang in 2025. |
| 51600 | Fairfax city | Fairfax City | Independent city, surrounded by Fairfax County. Small. |
| 51610 | Falls Church city | Falls Church | Independent city. Tiny inventory; second-highest $/sqft after DC. |
| 51683 | Manassas city | Manassas | Independent city. Affordable NoVA option. |
| 51685 | Manassas Park city | Manassas Park | Independent city. Small. Adjacent to Manassas. |

## Notes on independent cities

Virginia is the only state where independent cities are county-equivalents (their own FIPS, no overlap with surrounding counties). Designs should treat Alexandria, Falls Church, Fairfax City, Manassas, and Manassas Park as peers to counties, not as nested cities. The same is true of Baltimore City in Maryland (independent of Baltimore County).

If space requires omitting some, the tiny ones (Fairfax City, Falls Church, Manassas, Manassas Park) can be grouped or scrolled. The major cities (Alexandria, Baltimore City, DC) cannot be omitted — they are the most-populated jurisdictions in the metro.

## Geographic layout for the choropleth

Use this rough layout for a stylized SVG of the DMV. Don't try for accuracy; the goal is readable adjacency, not cartographic correctness.

```
                         Frederick (24021)
                              |
                    Montgomery (24031) — Howard (24027) — Baltimore Co. (24005) — Baltimore City (24510)
                              |                                       |
  Loudoun (51107) — Fairfax County (51059) — DC (11001) — Prince George's (24033) — Anne Arundel (24003)
                    Arlington (51013), Falls Church (51610), Fairfax City (51600), Alexandria (51510)
                              |                                       |
   Prince William (51153), Manassas (51683), Manassas Park (51685)    Charles (24017), Calvert (24009)
                              |
                    Stafford (51179)
                              |
                    Spotsylvania (51177)
```

For the stylized choropleth in the Home page mock, you can just use a grid or hex layout — make adjacency clear and color-codable. The real implementation will use proper GeoJSON polygons.

## Jurisdiction badge colors

Use these for a small badge next to county names throughout the UI (chart legends, headers, the comparison table):

- DC badge: red-100 background, red-800 text
- MD badge: amber-100 background, amber-800 text
- VA badge: blue-100 background, blue-800 text

The badge says "DC", "MD", or "VA". Same width, same height, consistent placement.
