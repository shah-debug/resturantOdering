import type { Metadata } from 'next';
import { AccountShell } from '@/components/shell/account-shell';
import { ChangePasswordForm } from '@/features/auth';

export const metadata: Metadata = { title: 'Change password' };

export default function ChangePasswordPage() {
  return (
    <AccountShell breadcrumbs={[{ label: 'Restaurants', href: '/' }, { label: 'Change password' }]}>
      <ChangePasswordForm />
    </AccountShell>
  );
}
