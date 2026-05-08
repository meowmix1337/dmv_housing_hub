import { lazy, Suspense } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getCountySummary, getMortgageRates } from '../api.js';
import { deriveMetroSnapshot } from '../lib/metro.js';
import { DMV_FIPS } from '../lib/fips.js';
import { Hero } from '../components/home/Hero.js';
import { MetricStrip } from '../components/home/MetricStrip.js';
import { BiggestMovers } from '../components/home/BiggestMovers.js';
import { WhatsDriving } from '../components/home/WhatsDriving.js';
import { Container } from '../components/Container.js';

const ChoroplethMap = lazy(() => import('../components/ChoroplethMap.js'));

function MapPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-border-soft p-12 text-center text-fg-3">
      Loading map…
    </div>
  );
}

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
      ? deriveMetroSnapshot(counties, mortgageRates)
      : null;

  return (
    <div className="bg-bg-paper min-h-screen">
      <Hero />

      {metro && <MetricStrip metro={metro} />}

      <Container className="mt-14">
        <Suspense fallback={<MapPlaceholder />}>
          <ChoroplethMap counties={counties} />
        </Suspense>
      </Container>

      {counties.length > 0 && (
        <Container className="mt-20">
          <BiggestMovers counties={counties} />
        </Container>
      )}

      {mortgageRates && (
        <Container className="mt-20 mb-24">
          <WhatsDriving mortgageRates={mortgageRates} />
        </Container>
      )}
    </div>
  );
}
