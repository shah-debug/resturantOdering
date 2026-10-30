import type { Metadata } from 'next';
import { PlatformOverviewPage } from '@/features/platform';

export const metadata: Metadata = { title: 'Platform overview' };

export default function PlatformPage() {
  return <PlatformOverviewPage />;
}
