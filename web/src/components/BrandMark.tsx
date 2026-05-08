interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size = 28 }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#2B201A" />
      <rect x="7" y="9" width="4" height="14" rx="1" fill="#dc2626" />
      <rect x="14" y="13" width="4" height="10" rx="1" fill="#ca8a04" />
      <rect x="21" y="11" width="4" height="12" rx="1" fill="#1d4ed8" />
    </svg>
  );
}
