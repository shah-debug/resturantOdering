import type { Metadata } from 'next';
import { OnboardingWizard } from '@/features/restaurant';
import { firstParam, type SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Setup' };

export default async function OrganizationOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ organizationId }, query] = await Promise.all([params, searchParams]);
  return <OnboardingWizard organizationId={organizationId} step={firstParam(query.step)} />;
}
