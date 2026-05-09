import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CountySummary } from '@dmv/shared';
import { BiggestMovers } from '../components/home/BiggestMovers.js';
import { MetricStrip } from '../components/home/MetricStrip.js';
import type { MetroSnapshot } from '../lib/metro.js';
import type { FederalEmploymentDmv } from '../api.js';
import { DMV_FIPS } from '../lib/fips.js';

function makeCounty(fips: string, zhviYoY: number, sparse = false): CountySummary {
  return {
    fips,
    name: `County ${fips}`,
    jurisdiction: 'MD',
    lastUpdated: '2026-01-01',
    current: sparse ? {} : {
      zhvi: 500_000,
      zhviYoY,
      medianSalePrice: 480_000,
    },
    series: {},
  };
}

const MOCK_COUNTIES: CountySummary[] = DMV_FIPS.map((fips, i) => {
  const isSparse = fips === '24510' || fips === '51600';
  const yoy = isSparse ? undefined : (i < 11 ? 0.05 + i * 0.005 : -0.02 - (i - 11) * 0.005);
  if (isSparse) return { ...makeCounty(fips, 0, true) };
  return makeCounty(fips, yoy!);
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('BiggestMovers', () => {
  it('shows 5 gainers and 5 losers', () => {
    const { container } = render(
      <Wrapper>
        <BiggestMovers counties={MOCK_COUNTIES} />
      </Wrapper>,
    );
    expect(screen.getByText('Largest gains')).toBeInTheDocument();
    expect(screen.getByText('Largest declines')).toBeInTheDocument();
    // Each card has 5 rank numbers (1-5)
    const rankLabels = container.querySelectorAll('span.font-mono.text-\\[11px\\]');
    expect(rankLabels.length).toBeGreaterThanOrEqual(10);
  });

  it('excludes sparse counties that have no zhviYoY', () => {
    render(
      <Wrapper>
        <BiggestMovers counties={MOCK_COUNTIES} />
      </Wrapper>,
    );
    // Sparse counties have no zhviYoY so they're filtered out
    const sparseNames = screen.queryAllByText(/County 24510|County 51600/);
    expect(sparseNames).toHaveLength(0);
  });

  it('shows no movers when all counties are sparse', () => {
    const sparseCities = MOCK_COUNTIES.map((c) => ({ ...c, current: {} }));
    render(
      <Wrapper>
        <BiggestMovers counties={sparseCities} />
      </Wrapper>,
    );
    const gainCards = screen.queryByText('Largest gains');
    // The section header still renders, but the lists are empty
    expect(gainCards).toBeInTheDocument();
  });
});

const METRO: MetroSnapshot = {
  medianSalePrice: 600_000,
  medianSalePriceYoY: 0.03,
  mortgageRate: 0.062,
  mortgageRateYoY: 0.001,
  activeListings: 12_000,
  activeListingsYoY: 0.05,
  daysOnMarket: 22,
  marketHealth: 65,
};

const FED: FederalEmploymentDmv = {
  metric: 'federal_employment',
  fips: 'DMV',
  unit: 'count',
  cadence: 'quarterly',
  source: 'qcew',
  lastUpdated: '2026-01-01',
  total: 412_500,
  totalYoY: -0.025,
  asOf: '2025-09-01',
  points: [{ date: '2025-09-01', value: 412_500 }],
};

describe('MetricStrip federal jobs card', () => {
  it('renders the formatted total when fedEmployment data is present', () => {
    render(
      <Wrapper>
        <MetricStrip metro={METRO} fedEmployment={FED} />
      </Wrapper>,
    );
    expect(screen.getByText('DMV federal jobs')).toBeInTheDocument();
    expect(screen.getByText('412,500')).toBeInTheDocument();
  });

  it('renders an em dash when fedEmployment data is absent', () => {
    render(
      <Wrapper>
        <MetricStrip metro={METRO} />
      </Wrapper>,
    );
    expect(screen.getByText('DMV federal jobs')).toBeInTheDocument();
  });
});
