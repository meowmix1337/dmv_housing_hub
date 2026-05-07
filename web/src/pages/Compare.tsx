/**
 * Compare page — multi-county overlay chart.
 *
 * STATUS: stub. Implement in step 11 of PROJECT_SPEC.
 *
 * Behavior to build:
 *   - Multi-select up to 5 counties from DMV_COUNTIES.
 *   - Choose a metric (FHFA HPI, ZHVI, days on market, etc.).
 *   - Fetch each county's summary in parallel via React Query.
 *   - Render Recharts LineChart with one Line per county.
 *   - Persist selection in URL search params for shareability.
 */

export function Compare() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Compare counties</h1>
      <p className="text-neutral-600">
        Select up to five jurisdictions to overlay metrics. (Coming in step 11.)
      </p>
    </div>
  );
}
