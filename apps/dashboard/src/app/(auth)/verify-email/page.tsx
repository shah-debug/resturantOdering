import type { Metadata } from 'next';
import { VerifyEmail } from '@/features/auth';
import { firstParam, type SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Verify email', referrer: 'no-referrer' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  return <VerifyEmail token={firstParam(token)} />;
}
