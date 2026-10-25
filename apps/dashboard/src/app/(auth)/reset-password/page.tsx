import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/features/auth';
import { firstParam, type SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Reset password', referrer: 'no-referrer' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={firstParam(token)} />;
}
