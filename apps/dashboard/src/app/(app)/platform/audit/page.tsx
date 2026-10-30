import type { Metadata } from 'next';
import { AuditPage } from '@/features/platform';
import { firstParam, type SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Audit log · Platform' };

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const organizationId = firstParam((await searchParams).organizationId);
  const valid =
    organizationId && /^[0-9a-f-]{36}$/i.test(organizationId) ? organizationId : undefined;
  return <AuditPage organizationId={valid} />;
}
