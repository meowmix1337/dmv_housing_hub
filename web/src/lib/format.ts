const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatCurrency(value: number): string {
  return usd0.format(value);
}

export function formatNumber(value: number): string {
  return num0.format(value);
}

export function formatPercent(ratio: number, fractionDigits = 1): string {
  const sign = ratio > 0 ? '+' : '';
  return `${sign}${(ratio * 100).toFixed(fractionDigits)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
