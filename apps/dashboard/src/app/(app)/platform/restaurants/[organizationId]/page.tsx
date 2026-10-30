import type { Metadata } from 'next';
import { RestaurantDetailPage } from '@/features/platform';

export const metadata: Metadata = { title: 'Restaurant · Platform' };

export default async function PlatformRestaurantPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <RestaurantDetailPage organizationId={organizationId} />;
}
