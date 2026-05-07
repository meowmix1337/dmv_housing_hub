import { describe, it, expect } from 'vitest';
import { periodToIso, parseBlsResponse } from './bls.js';
import { IngestError } from '../lib/errors.js';

// Minimal SeriesMeta map for fixture tests
const TEST_META = new Map([
  [
    'LAUCN240310000000003',
    { fips: '24031', metric: 'unemployment_rate' as const, unit: 'percent' as const },
  ],
  [
    'SMU11479009091000001',
    { fips: '11-metro', metric: 'federal_employment' as const, unit: 'count' as const },
  ],
]);

function makeResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    status: 'REQUEST_SUCCEEDED',
    Results: {
      series: [
        {
          seriesID: 'LAUCN240310000000003',
          data: [
            { year: '2024', period: 'M03', value: '3.2', footnotes: [] },
            { year: '2024', period: 'M02', value: '3.5', footnotes: [] },
          ],
        },
        {
          seriesID: 'SMU11479009091000001',
          data: [{ year: '2024', period: 'M01', value: '395100', footnotes: [] }],
        },
      ],
    },
    ...overrides,
  };
}

describe('periodToIso', () => {
  it('converts M03 to the first of March', () => {
    expect(periodToIso('2024', 'M03')).toBe('2024-03-01');
  });

  it('converts M12 to the first of December', () => {
    expect(periodToIso('2024', 'M12')).toBe('2024-12-01');
  });

  it('converts M01 to the first of January', () => {
    expect(periodToIso('2024', 'M01')).toBe('2024-01-01');
  });

  it('returns null for M13 (annual average)', () => {
    expect(periodToIso('2024', 'M13')).toBeNull();
  });
});

describe('parseBlsResponse', () => {
  it('returns correct observations from a valid response', () => {
    const obs = parseBlsResponse(makeResponse(), TEST_META);
    expect(obs).toHaveLength(3);
  });

  it('maps LAUS series to unemployment_rate with correct fields', () => {
    const obs = parseBlsResponse(makeResponse(), TEST_META);
    const laus = obs.filter((o) => o.series === 'LAUCN240310000000003');
    expect(laus).toHaveLength(2);
    expect(laus[0]!).toMatchObject({
      source: 'bls',
      fips: '24031',
      metric: 'unemployment_rate',
      unit: 'percent',
      observedAt: '2024-03-01',
      value: 3.2,
    });
  });

  it('maps CES series to federal_employment with 11-metro fips', () => {
    const obs = parseBlsResponse(makeResponse(), TEST_META);
    const ces = obs.find((o) => o.series === 'SMU11479009091000001');
    expect(ces!).toMatchObject({
      source: 'bls',
      fips: '11-metro',
      metric: 'federal_employment',
      unit: 'count',
      observedAt: '2024-01-01',
      value: 395100,
    });
  });

  it('skips M13 annual-average periods', () => {
    const response = makeResponse({
      Results: {
        series: [
          {
            seriesID: 'LAUCN240310000000003',
            data: [
              { year: '2024', period: 'M01', value: '3.1', footnotes: [] },
              { year: '2024', period: 'M13', value: '3.3', footnotes: [] },
            ],
          },
        ],
      },
    });
    const obs = parseBlsResponse(response, TEST_META);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.observedAt).toBe('2024-01-01');
  });

  it('skips observations with the "-" missing-value sentinel', () => {
    const response = makeResponse({
      Results: {
        series: [
          {
            seriesID: 'LAUCN240310000000003',
            data: [
              { year: '2024', period: 'M01', value: '-', footnotes: [] },
              { year: '2024', period: 'M02', value: '3.5', footnotes: [] },
            ],
          },
        ],
      },
    });
    const obs = parseBlsResponse(response, TEST_META);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.value).toBe(3.5);
  });

  it('throws IngestError when status is REQUEST_FAILED', () => {
    const response = {
      status: 'REQUEST_FAILED',
      message: ['Series does not exist'],
    };
    expect(() => parseBlsResponse(response, TEST_META)).toThrow(IngestError);
    expect(() => parseBlsResponse(response, TEST_META)).toThrow('BLS request failed');
  });
});
