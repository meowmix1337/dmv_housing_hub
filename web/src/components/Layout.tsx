import { Link, NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            DMV Housing
          </Link>
          <nav className="flex gap-6 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'font-medium' : 'text-neutral-600 hover:text-neutral-900'
              }
            >
              Overview
            </NavLink>
            <NavLink
              to="/compare"
              className={({ isActive }) =>
                isActive ? 'font-medium' : 'text-neutral-600 hover:text-neutral-900'
              }
            >
              Compare
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-neutral-200 bg-white text-xs text-neutral-500">
        <div className="max-w-6xl mx-auto px-4 py-4">
          Data sources: FRED, U.S. Census Bureau, BLS, Zillow Research, Redfin Data Center.
          Updated automatically via GitHub Actions.
        </div>
      </footer>
    </div>
  );
}
