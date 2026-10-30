import type { Metadata } from 'next';
import { KitchenPage } from '@/features/orders';

export const metadata: Metadata = { title: 'Kitchen' };

export default async function OrganizationKitchenPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <KitchenPage organizationId={organizationId} />;
}
