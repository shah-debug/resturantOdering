'use client';

import { Alert } from '@app/web/ui';
import Link from 'next/link';
import { useNow } from '@/lib/use-now';
import { useGetSubscriptionStateQuery } from '../billing-api';
import { billingNotice } from '../billing-text';

export function BillingBanner({
  organizationId,
  canSeeBilling,
}: {
  organizationId: string;
  canSeeBilling: boolean;
}) {
  const state = useGetSubscriptionStateQuery(organizationId);
  const now = useNow(60_000);
  if (!state.data) {
    return null;
  }
  const notice = billingNotice(state.data, now);
  if (!notice) {
    return null;
  }
  return (
    <Alert
      variant={notice.tone === 'danger' ? 'destructive' : 'default'}
      title={notice.title}
      className={notice.tone === 'warning' ? 'border-warning/60 bg-warning/10' : undefined}
    >
      <p>{notice.detail}</p>
      {canSeeBilling ? (
        <Link
          href={`/organizations/${encodeURIComponent(organizationId)}/billing`}
          className="mt-1 inline-block font-medium underline underline-offset-4"
        >
          Go to Billing
        </Link>
      ) : (
        <p className="mt-1">Ask the restaurant owner to check the Billing page.</p>
      )}
    </Alert>
  );
}
