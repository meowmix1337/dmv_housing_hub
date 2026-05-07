import { Link } from 'react-router-dom';

const COUNTIES = [
  // District of Columbia
  { fips: '11001', name: 'District of Columbia' },
  // Maryland
  { fips: '24003', name: 'Anne Arundel County, MD' },
  { fips: '24005', name: 'Baltimore County, MD' },
  { fips: '24009', name: 'Calvert County, MD' },
  { fips: '24017', name: 'Charles County, MD' },
  { fips: '24021', name: 'Frederick County, MD' },
  { fips: '24027', name: 'Howard County, MD' },
  { fips: '24031', name: 'Montgomery County, MD' },
  { fips: '24033', name: "Prince George's County, MD" },
  { fips: '24510', name: 'Baltimore City, MD' },
  // Virginia
  { fips: '51013', name: 'Arlington County, VA' },
  { fips: '51059', name: 'Fairfax County, VA' },
  { fips: '51107', name: 'Loudoun County, VA' },
  { fips: '51153', name: 'Prince William County, VA' },
  { fips: '51177', name: 'Spotsylvania County, VA' },
  { fips: '51179', name: 'Stafford County, VA' },
  { fips: '51510', name: 'Alexandria, VA' },
  { fips: '51600', name: 'Fairfax City, VA' },
  { fips: '51610', name: 'Falls Church, VA' },
  { fips: '51683', name: 'Manassas, VA' },
  { fips: '51685', name: 'Manassas Park, VA' },
];

export function Home() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">DMV housing market</h1>
        <p className="mt-2 text-neutral-600 max-w-2xl">
          Interactive dashboard for the Washington, D.C. / Maryland / Virginia metro area, with
          county-level breakdowns of prices, inventory, affordability, and market health.
        </p>
      </section>

      {/* TODO: Replace with ChoroplethMap once GeoJSON + ingest are wired */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="font-medium">Counties</h2>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {COUNTIES.map((c) => (
            <li key={c.fips}>
              <Link
                to={`/county/${c.fips}`}
                className="block rounded-md px-3 py-2 text-sm hover:bg-neutral-100"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
