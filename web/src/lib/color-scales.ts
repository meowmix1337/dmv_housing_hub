export type ChoroplethMetric = 'zhviYoY' | 'zhvi' | 'daysOnMarket' | 'monthsSupply' | 'marketHealthScore';

// Diverging ramp for YoY signed metrics (red negative → neutral → green positive)
export const YOY_STOPS: Array<[number, string]> = [
  [-0.10, '#7F1D1D'],
  [-0.06, '#B91C1C'],
  [-0.03, '#DC2626'],
  [-0.01, '#F87171'],
  [0, '#F4EFE5'],
  [0.01, '#BBF7D0'],
  [0.04, '#4ADE80'],
  [0.08, '#16A34A'],
  [0.12, '#14532D'],
];

// Sequential ramp for non-signed metrics (light paper → dark ink)
export const SEQ_STOPS: Array<[number, string]> = [
  [0, '#F4EFE5'],
  [0.2, '#C9C2B4'],
  [0.4, '#9A9384'],
  [0.6, '#6B6557'],
  [0.8, '#4A4538'],
  [1.0, '#2B201A'],
];

// 4-bucket categorical health scale
export const HEALTH_STOPS: Array<[number, string]> = [
  [0, '#dc2626'],
  [36, '#d97706'],
  [56, '#1d4ed8'],
  [76, '#059669'],
  [100, '#059669'],
];

export function interpolateColor(stops: Array<[number, string]>, value: number): string {
  if (stops.length === 0) return '#F4EFE5';
  if (value <= stops[0]![0]) return stops[0]![1];
  if (value >= stops[stops.length - 1]![0]) return stops[stops.length - 1]![1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [lo, loColor] = stops[i]!;
    const [hi, hiColor] = stops[i + 1]!;
    if (value >= lo && value <= hi) {
      const t = (value - lo) / (hi - lo);
      return blendHex(loColor, hiColor, t);
    }
  }
  return '#F4EFE5';
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function blendHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bv].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function colorForMetric(metric: ChoroplethMetric, value: number): string {
  switch (metric) {
    case 'zhviYoY':
      return interpolateColor(YOY_STOPS, value);
    case 'marketHealthScore':
      return interpolateColor(HEALTH_STOPS, value);
    default:
      return '#F4EFE5';
  }
}
