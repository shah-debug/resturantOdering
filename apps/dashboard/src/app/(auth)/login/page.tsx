import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth';
import { firstParam, type SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { next } = await searchParams;
  return <LoginForm next={firstParam(next)} />;
}
