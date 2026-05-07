import type { Jurisdiction } from '@dmv/shared';

/** Ordered palette for multi-county comparison overlays (up to 5 counties). */
export const COUNTY_COLORS = [
  '#1d4ed8', // blue-700
  '#b45309', // amber-700
  '#15803d', // green-700
  '#9333ea', // purple-600
  '#be123c', // rose-700
] as const;

/** Choropleth diverging scale: red (declining) → white → blue (appreciating). */
export const CHOROPLETH_SCALE = {
  negative: '#ef4444', // red-500
  neutral: '#f3f4f6',  // neutral-100
  positive: '#1d4ed8', // blue-700
};

/** Consistent accent color per jurisdiction for labels and borders. */
export const JURISDICTION_COLORS: Record<Jurisdiction, string> = {
  DC: '#1d4ed8',
  MD: '#15803d',
  VA: '#b45309',
};
