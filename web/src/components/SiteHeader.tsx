import { Link, NavLink, useLocation } from 'react-router-dom';
import { BrandMark } from './BrandMark.js';

interface NavLinkSpec {
  to: string;
  label: string;
  end: boolean;
  alsoActiveOn?: (pathname: string) => boolean;
}

const NAV_LINKS: NavLinkSpec[] = [
  { to: '/', label: 'Overview', end: true },
  {
    to: '/counties',
    label: 'Counties',
    end: false,
    alsoActiveOn: (p) => p.startsWith('/county/'),
  },
  { to: '/compare', label: 'Compare', end: false },
  { to: '/methodology', label: 'Data & methods', end: false },
];

export function SiteHeader() {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-20 border-b border-border-soft"
      style={{ background: 'rgba(251,248,243,0.88)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', height: 64 }}>
      <div className="max-w-container mx-auto px-8 h-full flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <BrandMark />
          <span className="font-display text-[18px] font-semibold text-fg-1 tracking-tight">
            DMV Housing
          </span>
        </Link>
        <nav className="flex gap-0.5 ml-4" aria-label="Main navigation">
          {NAV_LINKS.map(({ to, label, end, alsoActiveOn }) => {
            const forcedActive = alsoActiveOn?.(pathname) ?? false;
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-current={forcedActive ? 'page' : undefined}
                className={({ isActive }) => {
                  const active = isActive || forcedActive;
                  return `px-3.5 py-2 text-sm font-medium rounded-sm no-underline transition-colors ${
                    active
                      ? 'text-fg-1 bg-bg-soft'
                      : 'text-fg-2 hover:text-fg-1 hover:bg-bg-soft'
                  }`;
                }}
              >
                {label}
              </NavLink>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <a
            href="https://github.com/meowmix1337/dmv_housing_hub"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-fg-2 px-3 py-1.5 border border-border-soft rounded-sm bg-surface-1 no-underline hover:text-fg-1"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
