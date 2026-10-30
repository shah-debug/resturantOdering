import type { Metadata } from 'next';
import { ReceiptPage } from '@/features/orders';

export const metadata: Metadata = { title: 'Receipt' };

export default async function OrganizationReceiptPage({
  params,
}: {
  params: Promise<{ organizationId: string; orderId: string }>;
}) {
  const { organizationId, orderId } = await params;
  return <ReceiptPage organizationId={organizationId} orderId={orderId} />;
}
