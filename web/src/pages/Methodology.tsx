import { Container } from '../components/Container.js';
import { FOOTER_SOURCES } from '../components/SiteFooter.js';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 font-display text-xl font-semibold text-fg-1">{title}</h2>
      <div className="prose text-sm text-fg-2 leading-relaxed max-w-reading">{children}</div>
    </section>
  );
}

export function Methodology() {
  return (
    <div className="bg-bg-paper min-h-screen py-12">
      <Container>
        <div className="max-w-reading">
          <h1 className="mb-2 font-display text-3xl font-semibold text-fg-1">Data &amp; methods</h1>
          <p className="mb-12 text-sm text-fg-3">
            How we collect, transform, and present DMV housing market data.
          </p>

          <Section title="Data sources">
            <p className="mb-4">
              All data is sourced from public agencies and major industry feeds. No proprietary or
              paywalled data is used. Sources are updated on the schedules listed below.
            </p>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="pb-2 pr-6 font-semibold text-fg-1">Provider</th>
                  <th className="pb-2 font-semibold text-fg-1">Series used</th>
                </tr>
              </thead>
              <tbody>
                {FOOTER_SOURCES.map((s) => (
                  <tr key={s.name} className="border-b border-border-soft">
                    <td className="py-2 pr-6 text-fg-1">{s.name}</td>
                    <td className="py-2 text-fg-2">{s.series}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Market health score">
            <p className="mb-3">
              The market health score is a 0–100 composite computed at build time from up to four
              sub-indicators. At least three must be present for a score to be emitted; otherwise the
              field is omitted and the UI shows an &ldquo;Insufficient data&rdquo; placeholder.
            </p>
            <ul className="mb-3 list-disc pl-5 space-y-1">
              <li><strong>Months of supply (30%).</strong> Scored 0–100 on a curve: ≤2 mo = 100, ≥6 mo = 0.</li>
              <li><strong>Sale-to-list ratio (25%).</strong> ≥1.05 = 100, ≤0.90 = 0; linear between.</li>
              <li><strong>Pct sold above list (20%).</strong> ≥60% = 100, 0% = 0; linear.</li>
              <li><strong>Inventory YoY change (25%).</strong> ≤−20% = 100 (shrinking supply), ≥+20% = 0; linear.</li>
            </ul>
            <p>
              The score does not predict future prices. It summarises current market tightness as
              measured by these four supply/demand signals.
            </p>
          </Section>

          <Section title="Affordability index">
            <p className="mb-3">
              The affordability index is the ratio of estimated monthly housing costs (PITI) to
              median monthly household income. A ratio at or below 0.30 (30%) satisfies the standard
              &ldquo;30% rule.&rdquo;
            </p>
            <p className="mb-3">
              Monthly costs assume: 80% LTV (20% down payment), 30-year fixed mortgage at the
              national average rate from Freddie Mac PMMS, county-specific property tax rate from
              public tax records, and 0.35% of home value per year for insurance.
            </p>
            <p>
              Income is the ACS 5-year median household income for the county. The index uses the
              Zillow ZHVI as the home price input. All three inputs must be present; otherwise the
              field is omitted.
            </p>
          </Section>

          <Section title="Pipeline architecture">
            <p className="mb-3">
              There is no runtime backend. Data is precomputed by a GitHub Actions workflow on a
              monthly cadence, committed as static JSON files, and served directly from Cloudflare
              Pages. Each county page fetches a single JSON file on load.
            </p>
            <p>
              The source code for the ingest and transform pipeline is open source. Each ingester
              implements a typed <code>DataSource</code> interface; the transform step joins multiple
              source caches into per-county <code>CountySummary</code> JSON files. Raw values are
              never invented — if an upstream field is missing, the derived metric is omitted and a
              warning is logged.
            </p>
          </Section>

          <Section title="Limitations">
            <ul className="list-disc pl-5 space-y-1">
              <li>ZHVI and FHFA HPI lag by 4–6 weeks; Redfin metrics lag by 1–2 weeks.</li>
              <li>
                Federal employment exposure data is not yet available (QCEW ingest pending).
              </li>
              <li>Price forecasts are not yet available (Bright MLS / NAR forecast ingest pending).</li>
              <li>
                Baltimore city (FIPS 24510) and Fairfax city (FIPS 51600) have no Redfin coverage;
                Redfin-derived metrics are omitted for these jurisdictions.
              </li>
              <li>
                The affordability calculator uses a single national mortgage rate. Actual rates vary
                by credit score, loan type, and lender.
              </li>
            </ul>
          </Section>
        </div>
      </Container>
    </div>
  );
}
