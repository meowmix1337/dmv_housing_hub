import type { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

export function Container({ children, className = '' }: ContainerProps) {
  return (
    <div className={`max-w-container mx-auto px-8 ${className}`}>
      {children}
    </div>
  );
}
