import type { ReactNode } from 'react';

interface SourceProps {
  children: ReactNode;
}

export function Source({ children }: SourceProps) {
  return (
    <div className="mt-3 text-xs font-mono text-fg-3">{children}</div>
  );
}
