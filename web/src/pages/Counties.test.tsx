import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CountySummary } from '@dmv/shared';

vi.mock('maplibre-gl', () => ({
  default: { Map: vi.fn(() => ({ on: vi.fn(), once: vi.fn(), remove: vi.fn(), addSource: vi.fn(), addLayer: vi.fn(), setFeatureState: vi.fn(), setPaintProperty: vi.fn(), getCanvas: vi.fn(() => ({ style: {} })), isStyleLoaded: vi.fn(() => true) })) },
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const MONTGOMERY: CountySummary = {
  fips: '24031', name: 'Montgomery County', jurisdiction: 'MD',
  lastUpdated: '2026-01-01',
  current: { zhvi: 620_000, daysOnMarket: 18, marketHealthScore: 72 },
  series: {},
};
const DC: CountySummary = {
  fips: '11001', name: 'District of Columbia', jurisdiction: 'DC',
  lastUpdated: '2026-01-01',
  current: { zhvi: 700_000 },
  series: {},
};
const ARLINGTON: CountySummary = {
  fips: '51013', name: 'Arlington County', jurisdiction: 'VA',
  lastUpdated: '2026-01-01',
  current: { zhvi: 750_000 },
  series: {},
};

function makeQC(counties: CountySummary[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const c of counties) qc.setQueryData(['county', c.fips], c);
  return qc;
}

describe('Counties page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all loaded counties', async () => {
    const qc = makeQC([MONTGOMERY, DC, ARLINGTON]);
    const { Counties } = await import('../pages/Counties.js');
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Counties />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Montgomery County')).toBeInTheDocument();
    expect(screen.getByText('District of Columbia')).toBeInTheDocument();
    expect(screen.getByText('Arlington County')).toBeInTheDocument();
  });

  it('filters counties by search query', async () => {
    const qc = makeQC([MONTGOMERY, DC, ARLINGTON]);
    const { Counties } = await import('../pages/Counties.js');
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Counties />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const input = screen.getByRole('searchbox');
    await userEvent.type(input, 'mont');

    expect(screen.getByText('Montgomery County')).toBeInTheDocument();
    expect(screen.queryByText('District of Columbia')).not.toBeInTheDocument();
    expect(screen.queryByText('Arlington County')).not.toBeInTheDocument();
  });
});
