import type { Metadata } from 'next';
import { ReportsPage } from '@/features/reports';

export const metadata: Metadata = { title: 'Reports' };

export default async function OrganizationReportsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <ReportsPage organizationId={organizationId} />;
}
