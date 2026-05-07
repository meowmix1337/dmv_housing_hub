import { describe, it, expect } from 'vitest';
import { parseRow, buildFipsIndex } from './redfin.js';

const FIPS_INDEX = buildFipsIndex();

function baseRow(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    PERIOD_BEGIN: '2024-01-01',
    PERIOD_END: '2024-01-07',
    PERIOD_DURATION: '7',
    REGION_TYPE: 'county',
    REGION: 'Montgomery County, MD',
    STATE: 'Maryland',
    STATE_CODE: 'MD',
    PROPERTY_TYPE: 'All Residential',
    MEDIAN_SALE_PRICE: '500000',
    MEDIAN_LIST_PRICE: '520000',
    MEDIAN_PPSF: '300',
    MEDIAN_LIST_PPSF: '310',
    HOMES_SOLD: '150',
    PENDING_SALES: '200',
    NEW_LISTINGS: '180',
    INVENTORY: '400',
    MONTHS_OF_SUPPLY: '1.5',
    MEDIAN_DOM: '12',
    AVG_SALE_TO_LIST: '1.012',
    SOLD_ABOVE_LIST: '0.45',
    PRICE_DROPS: '0.03',
    OFF_MARKET_IN_TWO_WEEKS: '0.25',
    ...overrides,
  };
}

describe('parseRow', () => {
  it('emits one observation per mapped column for a passing weekly row', () => {
    const obs = parseRow(baseRow(), FIPS_INDEX);
    expect(obs).toHaveLength(11);

    const salePrice = obs.find((o) => o.metric === 'median_sale_price');
    expect(salePrice).toMatchObject({
      source: 'redfin',
      series: 'redfin:county:all_residential',
      fips: '24031',
      metric: 'median_sale_price',
      observedAt: '2024-01-07',
      value: 500000,
      unit: 'USD',
    });

    const saleToList = obs.find((o) => o.metric === 'sale_to_list_ratio');
    expect(saleToList?.value).toBe(1.012);
    expect(saleToList?.unit).toBe('ratio');

    const soldAbove = obs.find((o) => o.metric === 'pct_sold_above_list');
    expect(soldAbove?.value).toBe(0.45);
    expect(soldAbove?.unit).toBe('percent');
  });

  it('returns empty array for monthly rows (period_duration = 30)', () => {
    const obs = parseRow(baseRow({ PERIOD_DURATION: '30' }), FIPS_INDEX);
    expect(obs).toHaveLength(0);
  });

  it('returns empty array for rows outside DMV (state_code = CA)', () => {
    const obs = parseRow(
      baseRow({ STATE_CODE: 'CA', REGION: 'San Diego County, CA' }),
      FIPS_INDEX,
    );
    expect(obs).toHaveLength(0);
  });

  it('resolves Alexandria city VA to FIPS 51510', () => {
    const obs = parseRow(
      baseRow({ REGION: 'Alexandria city, VA', STATE_CODE: 'VA' }),
      FIPS_INDEX,
    );
    const salePrice = obs.find((o) => o.metric === 'median_sale_price');
    expect(salePrice?.fips).toBe('51510');
  });
});
