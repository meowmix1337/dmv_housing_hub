import type { Jurisdiction } from '@dmv/shared';

/** Direction color for YoY changes: positive = green, negative = red, zero = blue. */
export function dirColor(n: number): string {
  if (n > 0) return '#059669';
  if (n < 0) return '#dc2626';
  return '#1d4ed8';
}

/** Health score color: 0-35 poor, 36-55 caution, 56-75 neutral, 76-100 good. */
export function healthColor(score: number): string {
  if (score >= 76) return '#059669';
  if (score >= 56) return '#1d4ed8';
  if (score >= 36) return '#d97706';
  return '#dc2626';
}

export const SEGMENT_COLORS = ['#dc2626', '#d97706', '#1d4ed8', '#059669'] as const;

/** Ordered palette for multi-county comparison overlays (up to 5 counties). */
export const COUNTY_COLORS = [
  '#1d4ed8',
  '#b45309',
  '#15803d',
  '#9333ea',
  '#be123c',
] as const;

/** Consistent accent color per jurisdiction for labels and borders. */
export const JURISDICTION_COLORS: Record<Jurisdiction, string> = {
  DC: '#dc2626',
  MD: '#ca8a04',
  VA: '#1d4ed8',
};
