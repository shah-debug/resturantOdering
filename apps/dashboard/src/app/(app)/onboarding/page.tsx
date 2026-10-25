import type { Metadata } from 'next';
import { AccountShell } from '@/components/shell/account-shell';
import { CreateRestaurantPage } from '@/features/restaurant';

export const metadata: Metadata = { title: 'Set up your restaurant' };

export default function OnboardingPage() {
  return (
    <AccountShell breadcrumbs={[{ label: 'Restaurants', href: '/' }, { label: 'New restaurant' }]}>
      <CreateRestaurantPage />
    </AccountShell>
  );
}
