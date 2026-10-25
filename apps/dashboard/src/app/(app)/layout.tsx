import type { ReactNode } from 'react';
import { AuthGate } from '@/components/shell/session';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
