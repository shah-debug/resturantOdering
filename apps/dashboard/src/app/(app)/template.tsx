import type { ReactNode } from 'react';

export default function SectionTransition({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
