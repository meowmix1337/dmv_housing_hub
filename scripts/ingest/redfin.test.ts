import { describe, it, expect } from 'vitest';
import { parseRow } from './redfin.js';

// Mirrors what buildFipsIndex() produces from DMV_COUNTIES
const FIPS_INDEX: ReadonlyMap<string, string> = new Map([
  ['montgomery county', '24031'],
  ['district of columbia', '11001'],
  ['alexandria city', '51510'],
  ['fairfax county', '51059'],
]);

function baseRow(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    period_begin: '2024-01-01',
    period_end: '2024-01-07',
    period_duration: '7',
    region_type: 'county',
    region: 'Montgomery County, MD',
    state: 'Maryland',
    state_code: 'MD',
    property_type: 'All Residential',
    median_sale_price: '500000',
    median_list_price: '520000',
    median_ppsf: '300',
    median_list_ppsf: '310',
    homes_sold: '150',
    pending_sales: '200',
    new_listings: '180',
    inventory: '400',
    months_of_supply: '1.5',
    median_dom: '12',
    avg_sale_to_list: '1.012',
    sold_above_list: '0.45',
    price_drops: '0.03',
    off_market_in_two_weeks: '0.25',
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
    const obs = parseRow(baseRow({ period_duration: '30' }), FIPS_INDEX);
    expect(obs).toHaveLength(0);
  });

  it('returns empty array for rows outside DMV (state_code = CA)', () => {
    const obs = parseRow(
      baseRow({ state_code: 'CA', region: 'San Diego County, CA' }),
      FIPS_INDEX,
    );
    expect(obs).toHaveLength(0);
  });

  it('resolves Alexandria city VA to FIPS 51510', () => {
    const obs = parseRow(
      baseRow({ region: 'Alexandria city, VA', state_code: 'VA' }),
      FIPS_INDEX,
    );
    const salePrice = obs.find((o) => o.metric === 'median_sale_price');
    expect(salePrice?.fips).toBe('51510');
  });
});
