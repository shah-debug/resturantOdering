import type { Metadata } from 'next';
import { CustomizationsPage } from '@/features/menu';

export const metadata: Metadata = { title: 'Customizations' };

export default async function MenuCustomizationsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <CustomizationsPage organizationId={organizationId} />;
}
