import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'default' | 'dense' | 'none';
}

export function Card({ children, className = '', padding = 'default' }: CardProps) {
  const padClass = padding === 'dense' ? 'p-5' : padding === 'none' ? '' : 'p-6';
  return (
    <div className={`bg-surface-1 rounded-lg border border-border-soft shadow-1 ${padClass} ${className}`}>
      {children}
    </div>
  );
}
