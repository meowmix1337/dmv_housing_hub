import { useQueries, useQuery } from '@tanstack/react-query';
import { getActiveListingsDmv, getCountySummary, getFederalEmploymentDmv, getMortgageRates } from '../api.js';
import { deriveMetroSnapshot } from '../lib/metro.js';
import { DMV_FIPS } from '../lib/fips.js';
import { Hero } from '../components/home/Hero.js';
import { MetricStrip } from '../components/home/MetricStrip.js';
import { BiggestMovers } from '../components/home/BiggestMovers.js';
import { WhatsDriving } from '../components/home/WhatsDriving.js';
import { Container } from '../components/Container.js';
import { HexMap } from '../components/HexMap.js';

export function Home() {
  const countyResults = useQueries({
    queries: DMV_FIPS.map((fips) => ({
      queryKey: ['county', fips] as const,
      queryFn: () => getCountySummary(fips),
    })),
  });

  const mortgageResult = useQuery({
    queryKey: ['mortgage-rates'] as const,
    queryFn: getMortgageRates,
  });

  const fedEmploymentResult = useQuery({
    queryKey: ['federal-employment-dmv'] as const,
    queryFn: getFederalEmploymentDmv,
  });

  const inventoryResult = useQuery({
    queryKey: ['active-listings-dmv'] as const,
    queryFn: getActiveListingsDmv,
  });

  const counties = countyResults
    .map((r) => r.data)
    .filter((d) => d !== undefined);

  const mortgageRates = mortgageResult.data;
  const isLoading = countyResults.some((r) => r.isLoading) || mortgageResult.isLoading;

  if (isLoading) {
    return (
      <div className="bg-bg-paper min-h-screen">
        <Hero />
        <div className="max-w-container mx-auto px-8 mt-8 text-fg-3 text-sm">Loading data…</div>
      </div>
    );
  }

  const metro =
    counties.length > 0 && mortgageRates
      ? deriveMetroSnapshot(counties, mortgageRates, inventoryResult.data)
      : null;

  return (
    <div className="bg-bg-paper min-h-screen">
      <Hero />

      {metro && <MetricStrip metro={metro} fedEmployment={fedEmploymentResult.data} />}

      <Container className="mt-14">
        <HexMap counties={counties} />
      </Container>

      {counties.length > 0 && (
        <Container className="mt-20">
          <BiggestMovers counties={counties} />
        </Container>
      )}

      {mortgageRates && (
        <Container className="mt-20 mb-24">
          <WhatsDriving
            mortgageRates={mortgageRates}
            fedEmployment={fedEmploymentResult.data}
            inventory={inventoryResult.data}
          />
        </Container>
      )}
    </div>
  );
}
