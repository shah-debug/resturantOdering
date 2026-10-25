import type { Metadata } from 'next';
import { OverviewPage } from '@/features/restaurant';

export const metadata: Metadata = { title: 'Overview' };

export default async function OrganizationOverviewPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <OverviewPage organizationId={organizationId} />;
}
