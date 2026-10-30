import type { ReactNode } from 'react';
import { PlatformShell } from '@/features/platform';

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <PlatformShell>{children}</PlatformShell>;
}
