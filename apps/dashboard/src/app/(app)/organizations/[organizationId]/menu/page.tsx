import type { Metadata } from 'next';
import { MenuPage } from '@/features/menu';

export const metadata: Metadata = { title: 'Menu' };

export default async function OrganizationMenuPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <MenuPage organizationId={organizationId} />;
}
