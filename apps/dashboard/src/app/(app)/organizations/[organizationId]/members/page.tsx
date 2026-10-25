import type { Metadata } from 'next';
import { MembersPage } from '@/features/organizations';

export const metadata: Metadata = { title: 'Team members' };

export default async function OrganizationMembersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <MembersPage organizationId={organizationId} />;
}
