'use client';

import {
  formatRupees,
  type PlatformPayment,
  SUBSCRIPTION_PAYMENT_METHOD_LABELS,
  type SubscriptionPaymentStatus,
} from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Skeleton,
  Textarea,
} from '@app/web/ui';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { EmptyState, ErrorState } from '@/components/states';
import {
  platformEvidenceUrl,
  useListPlatformPaymentsQuery,
  useReviewPaymentMutation,
} from '../billing-admin-api';
import { usePlatformRole } from './platform-shell';

const TABS: { status: SubscriptionPaymentStatus; label: string }[] = [
  { status: 'SUBMITTED', label: 'Waiting' },
  { status: 'VERIFIED', label: 'Verified' },
  { status: 'REJECTED', label: 'Rejected' },
];

function RejectDialog({ payment, onClose }: { payment: PlatformPayment; onClose: () => void }) {
  const [review, state] = useReviewPaymentMutation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setError('Explain why, in at least 5 characters. The restaurant sees this reason.');
      return;
    }
    try {
      await review({
        paymentId: payment.id,
        body: { decision: 'REJECT', reason: reason.trim() },
      }).unwrap();
      onClose();
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reject payment {payment.reference}</DialogTitle>
            <DialogDescription>
              The restaurant is emailed and can record the payment again.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" error={error ?? undefined}>
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={state.isLoading}>
              Reject payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentRow({ payment, canReview }: { payment: PlatformPayment; canReview: boolean }) {
  const [review, state] = useReviewPaymentMutation();
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = payment.amountMinor < payment.invoiceAmountMinor;

  async function verify() {
    setError(null);
    try {
      await review({ paymentId: payment.id, body: { decision: 'VERIFY' } }).unwrap();
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  return (
    <li className="grid gap-2 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/platform/restaurants/${payment.organizationId}`}
          className="font-semibold underline-offset-4 hover:underline"
        >
          {payment.organizationName}
        </Link>
        <span className="text-muted-foreground">{payment.invoiceNumber}</span>
        <Badge variant="outline">
          {payment.subscriptionStatus.toLowerCase().replace('_', ' ')}
        </Badge>
      </div>
      <dl className="grid gap-1 sm:grid-cols-2">
        <div>
          <dt className="inline text-muted-foreground">Amount: </dt>
          <dd className="inline font-medium tabular-nums">
            {formatRupees(payment.amountMinor)} of {formatRupees(payment.invoiceAmountMinor)}
          </dd>
          {short ? (
            <span className="ml-2 text-xs text-destructive">less than the invoice</span>
          ) : null}
        </div>
        <div>
          <dt className="inline text-muted-foreground">Method: </dt>
          <dd className="inline">{SUBSCRIPTION_PAYMENT_METHOD_LABELS[payment.method]}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Reference: </dt>
          <dd className="inline font-mono">{payment.reference}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Paid on: </dt>
          <dd className="inline">{payment.paidOn}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline text-muted-foreground">Recorded by: </dt>
          <dd className="inline">
            {payment.submittedBy ?? 'Unknown'}
            {payment.submittedByEmail ? ` (${payment.submittedByEmail})` : ''} on{' '}
            {new Date(payment.submittedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
          </dd>
        </div>
        {payment.note ? (
          <div className="sm:col-span-2">
            <dt className="inline text-muted-foreground">Note: </dt>
            <dd className="inline">{payment.note}</dd>
          </div>
        ) : null}
        {payment.reviewedBy ? (
          <div className="sm:col-span-2">
            <dt className="inline text-muted-foreground">Reviewed by: </dt>
            <dd className="inline">
              {payment.reviewedBy}
              {payment.rejectionReason ? ` · ${payment.rejectionReason}` : ''}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {payment.hasEvidence ? (
          <Button asChild variant="outline" size="sm">
            <a href={platformEvidenceUrl(payment.id)} target="_blank" rel="noreferrer">
              View receipt
            </a>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">No receipt attached</span>
        )}
        {canReview && payment.status === 'SUBMITTED' ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={state.isLoading}
              onClick={() => void verify()}
            >
              Verify payment
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </>
        ) : null}
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {rejecting ? <RejectDialog payment={payment} onClose={() => setRejecting(false)} /> : null}
    </li>
  );
}

export function PaymentsReviewPage() {
  const role = usePlatformRole();
  const [status, setStatus] = useState<SubscriptionPaymentStatus>('SUBMITTED');
  const [page, setPage] = useState(1);
  const payments = useListPlatformPaymentsQuery({ status, page });
  const totalPages = payments.data
    ? Math.max(1, Math.ceil(payments.data.total / payments.data.pageSize))
    : 1;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Restaurants record transfers here. Check each one against the bank or wallet statement
          before verifying. Only verified payments mark invoices as paid, and you cannot verify a
          payment you recorded yourself.
        </p>
      </div>
      <div role="tablist" aria-label="Payment status" className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            role="tab"
            aria-selected={status === tab.status}
            onClick={() => {
              setStatus(tab.status);
              setPage(1);
            }}
            className={`rounded-full border px-4 py-1.5 text-sm ${status === tab.status ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {payments.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : payments.error && !payments.data ? (
        <ErrorState
          error={payments.error}
          onRetry={() => void payments.refetch()}
          retrying={payments.isFetching}
        />
      ) : payments.data?.items.length === 0 ? (
        <EmptyState icon={Receipt} title="Nothing here" />
      ) : (
        <ul className="grid gap-3">
          {payments.data?.items.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} canReview={role === 'SUPER_ADMIN'} />
          ))}
        </ul>
      )}
      {payments.data && payments.data.total > payments.data.pageSize ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
