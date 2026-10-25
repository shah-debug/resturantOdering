import type { Metadata } from 'next';
import { AcceptInvitationForm } from '@/features/auth';
import { firstParam, type SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Accept invitation', referrer: 'no-referrer' };

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  return <AcceptInvitationForm token={firstParam(token)} />;
}
