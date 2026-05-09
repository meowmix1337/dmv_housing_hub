import type { CountySummary } from '@dmv/shared';

const OVERRIDES: Record<string, string> = {
  '11001': 'DC',
  '24005': 'Baltimore Co.',
};

export function shortName(c: Pick<CountySummary, 'fips' | 'name'>): string {
  const override = OVERRIDES[c.fips];
  if (override) return override;
  return c.name.replace(/ County$/, '').replace(/ city$/, '');
}
