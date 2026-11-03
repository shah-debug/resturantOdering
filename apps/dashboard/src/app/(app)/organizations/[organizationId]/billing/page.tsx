import type { Metadata } from 'next';
import { BillingPage } from '@/features/billing';

export const metadata: Metadata = { title: 'Billing' };

export default async function OrganizationBillingPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <BillingPage organizationId={organizationId} />;
}
