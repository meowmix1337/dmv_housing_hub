import { Link } from 'react-router-dom';
import { BrandMark } from './BrandMark.js';

export const FOOTER_SOURCES = [
  { name: 'U.S. Federal Housing Finance Agency', series: 'FHFA HPI, via FRED' },
  { name: 'Zillow Research', series: 'ZHVI All Homes' },
  { name: 'Redfin Data Center', series: 'Median sale price, DOM' },
  { name: 'U.S. Census Bureau', series: 'ACS 5-year 2023' },
  { name: 'Bureau of Labor Statistics', series: 'CES, QCEW' },
  { name: 'Freddie Mac PMMS', series: '30-year fixed rate' },
  { name: 'Bright MLS, NAR', series: 'Forecasts' },
];

export function SiteFooter() {
  return (
    <footer className="bg-bg-deep text-fg-on-deep mt-24">
      <div className="max-w-container mx-auto px-8 pt-16 pb-12">
        <div className="grid gap-12" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr' }}>
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark size={32} />
              <span className="font-display text-[20px] font-semibold text-paper-100">DMV Housing</span>
            </div>
            <p className="mt-4 text-sm text-paper-400 leading-snug max-w-[320px]">
              A free, public dashboard for the Washington, D.C., Maryland, and Virginia housing market.
              Data is read-only and sourced from federal agencies and major industry feeds.
            </p>
          </div>
          <div>
            <div className="eyebrow text-paper-400 mb-3">Pages</div>
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              <li><Link to="/" className="text-paper-100 text-sm no-underline hover:underline">Overview</Link></li>
              <li><Link to="/counties" className="text-paper-100 text-sm no-underline hover:underline">All counties</Link></li>
              <li><Link to="/compare" className="text-paper-100 text-sm no-underline hover:underline">Compare counties</Link></li>
              <li><Link to="/methodology" className="text-paper-100 text-sm no-underline hover:underline">Methodology</Link></li>
            </ul>
          </div>
          <div className="col-span-2">
            <div className="eyebrow text-paper-400 mb-3">Data sources</div>
            <ul className="list-none p-0 m-0" style={{ columns: 2, columnGap: 32 }}>
              {FOOTER_SOURCES.map((s) => (
                <li key={s.name} className="text-[13px] text-paper-400 mb-2" style={{ breakInside: 'avoid' }}>
                  <span className="text-paper-100">{s.name}</span>
                  {' — '}
                  <span className="font-mono text-xs">{s.series}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex justify-between text-xs text-paper-400 font-mono">
          <span>Open source on GitHub</span>
          <span>Not investment advice. Not affiliated with any government agency.</span>
        </div>
      </div>
    </footer>
  );
}
