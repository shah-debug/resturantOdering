import type { Metadata } from 'next';
import { RidersPage } from '@/features/riders';

export const metadata: Metadata = { title: 'Riders' };

export default async function OrganizationRidersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <RidersPage organizationId={organizationId} />;
}
