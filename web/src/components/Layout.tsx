import { Outlet } from 'react-router-dom';
import { SiteHeader } from './SiteHeader.js';
import { SiteFooter } from './SiteFooter.js';

export function Layout() {
  return (
    <div className="min-h-full flex flex-col bg-bg-paper">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
