import type { ReactNode } from 'react';
import { OrganizationShell } from '@/components/shell/organization-shell';

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <OrganizationShell organizationId={organizationId}>{children}</OrganizationShell>;
}
