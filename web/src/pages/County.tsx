import { useParams } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { getCountySummary, getMortgageRates } from '../api.js';
import { DMV_FIPS } from '../lib/fips.js';
import { CountyHeader } from '../components/county/CountyHeader.js';
import { SnapshotGrid } from '../components/county/SnapshotGrid.js';
import { BigChart } from '../components/county/BigChart.js';
import { Affordability } from '../components/county/Affordability.js';
import { MarketHealthBreakdown } from '../components/county/MarketHealthBreakdown.js';
import { FederalEmploymentChart } from '../components/county/FederalEmploymentChart.js';
import { CountyInventory } from '../components/county/CountyInventory.js';
import { Container } from '../components/Container.js';

export function County() {
  const { fips } = useParams<{ fips: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['county', fips],
    queryFn: () => {
      if (!fips) throw new Error('fips param missing');
      return getCountySummary(fips);
    },
    enabled: Boolean(fips),
  });

  const allCountyResults = useQueries({
    queries: DMV_FIPS.map((f) => ({
      queryKey: ['county', f] as const,
      queryFn: () => getCountySummary(f),
    })),
  });

  const mortgageResult = useQuery({
    queryKey: ['mortgage-rates'] as const,
    queryFn: getMortgageRates,
  });

  const allCounties = allCountyResults.map((r) => r.data).filter((d) => d !== undefined);
  const mortgageRate = mortgageResult.data?.points?.at(-1)?.value
    ? (mortgageResult.data.points.at(-1)!.value / 100)
    : undefined;

  if (!fips) return <div className="p-8 text-fg-3">Missing FIPS</div>;
  if (isLoading) return <div className="p-8 text-fg-3">Loading…</div>;
  if (error) return <div className="p-8 text-red-500">Failed to load county data.</div>;
  if (!data) return <div className="p-8 text-fg-3">No data</div>;

  return (
    <div className="bg-bg-paper min-h-screen">
      <CountyHeader county={data} />

      <Container className="mt-8">
        <SnapshotGrid county={data} />
      </Container>

      <Container className="mt-16">
        <BigChart county={data} allCounties={allCounties} />
      </Container>

      <Container className="mt-16">
        <div className="grid gap-8" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
          <Affordability county={data} defaultMortgageRate={mortgageRate} />
          <MarketHealthBreakdown county={data} />
        </div>
      </Container>

      <Container className="mt-16">
        <FederalEmploymentChart county={data} />
      </Container>

      <Container className="mt-16 mb-24">
        <CountyInventory county={data} />
      </Container>
    </div>
  );
}
