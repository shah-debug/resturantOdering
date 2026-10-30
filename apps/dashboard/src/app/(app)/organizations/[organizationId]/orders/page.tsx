import type { Metadata } from 'next';
import { OrdersPage } from '@/features/orders';

export const metadata: Metadata = { title: 'Orders' };

export default async function OrganizationOrdersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <OrdersPage organizationId={organizationId} />;
}
