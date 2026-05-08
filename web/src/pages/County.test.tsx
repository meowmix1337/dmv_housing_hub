import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CountySummary, MetricSeries } from '@dmv/shared';

vi.mock('maplibre-gl', () => ({
  default: { Map: vi.fn(() => ({ on: vi.fn(), once: vi.fn(), remove: vi.fn(), addSource: vi.fn(), addLayer: vi.fn(), setFeatureState: vi.fn(), setPaintProperty: vi.fn(), getCanvas: vi.fn(() => ({ style: {} })), isStyleLoaded: vi.fn(() => true) })) },
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const MORTGAGE_SERIES: MetricSeries = {
  metric: 'mortgage_30y_rate', fips: 'USA', unit: 'percent',
  cadence: 'weekly', source: 'fred', lastUpdated: '2026-01-01',
  points: [{ date: '2026-01-01', value: 6.23 }],
};

const FULL_COUNTY: CountySummary = {
  fips: '24031', name: 'Montgomery County', jurisdiction: 'MD',
  lastUpdated: '2026-01-01', population: 1062000,
  medianHouseholdIncome: 112_000, propertyTaxRate: 0.01,
  current: {
    zhvi: 620_000, zhviYoY: 0.04, medianSalePrice: 600_000,
    medianSalePriceYoY: 0.03, daysOnMarket: 18, monthsSupply: 1.8,
    saleToListRatio: 1.01, pctSoldAboveList: 0.45,
    marketHealthScore: 72, affordabilityIndex: 0.38,
  },
  series: { fhfaHpi: [{ date: '2020-01-01', value: 280 }, { date: '2023-01-01', value: 340 }] },
};

const SPARSE_COUNTY: CountySummary = {
  fips: '24510', name: 'Baltimore city', jurisdiction: 'MD',
  lastUpdated: '2026-01-01', current: {}, series: {},
};

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('County page', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders all six sections for a full county', async () => {
    const qc = makeQC();
    qc.setQueryData(['county', '24031'], FULL_COUNTY);
    qc.setQueryData(['mortgage-rates'], MORTGAGE_SERIES);

    const { County } = await import('../pages/County.js');
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/county/24031']}>
          <Routes><Route path="/county/:fips" element={<County />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Montgomery County')).toBeInTheDocument();
    expect(screen.getByText(/Typical home value/i)).toBeInTheDocument();
    expect(screen.getByText(/Home prices since 1975/i)).toBeInTheDocument();
    expect(screen.getByText(/Affordability calculator/i)).toBeInTheDocument();
    expect(screen.getByText(/2026 price forecast/i)).toBeInTheDocument();
    expect(screen.getByText(/Federal-employment exposure/i)).toBeInTheDocument();
  });

  it('renders sparse county with InsufficientData placeholders', async () => {
    const qc = makeQC();
    qc.setQueryData(['county', '24510'], SPARSE_COUNTY);
    qc.setQueryData(['mortgage-rates'], { ...MORTGAGE_SERIES, points: [] });

    const { County } = await import('../pages/County.js');
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/county/24510']}>
          <Routes><Route path="/county/:fips" element={<County />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Baltimore city')).toBeInTheDocument();
    const insufficient = screen.getAllByTestId('insufficient-data');
    expect(insufficient.length).toBeGreaterThanOrEqual(2);
  });
});

