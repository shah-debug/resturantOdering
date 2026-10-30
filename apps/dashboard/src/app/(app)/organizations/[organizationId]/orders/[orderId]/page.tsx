import type { Metadata } from 'next';
import { OrderDetailPage } from '@/features/orders';

export const metadata: Metadata = { title: 'Order' };

export default async function OrganizationOrderPage({
  params,
}: {
  params: Promise<{ organizationId: string; orderId: string }>;
}) {
  const { organizationId, orderId } = await params;
  return <OrderDetailPage organizationId={organizationId} orderId={orderId} />;
}
