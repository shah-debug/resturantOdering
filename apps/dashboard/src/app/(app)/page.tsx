import type { Metadata } from 'next';
import { AccountShell } from '@/components/shell/account-shell';
import { OrganizationsHome } from '@/features/organizations';

export const metadata: Metadata = { title: 'Restaurants' };

export default function HomePage() {
  return (
    <AccountShell breadcrumbs={[{ label: 'Restaurants' }]}>
      <OrganizationsHome />
    </AccountShell>
  );
}
