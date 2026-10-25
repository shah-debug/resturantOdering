import type { Metadata } from 'next';
import { SettingsPage } from '@/features/restaurant';

export const metadata: Metadata = { title: 'Settings' };

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <SettingsPage organizationId={organizationId} />;
}
