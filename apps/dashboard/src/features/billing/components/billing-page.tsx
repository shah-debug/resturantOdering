'use client';

import {
  type BillingOverview,
  formatRupees,
  type Invoice,
  normalizePaymentReference,
  RESOURCE_LABELS,
  SUBSCRIPTION_PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_PAYMENT_METHODS,
  type SubscriptionPaymentMethod,
  submitPaymentFieldsSchema,
} from '@app/contracts';
import { getErrorMessage, getFieldErrors } from '@app/web/api';
import { Alert, Badge, Button, Field, Input, Select, Skeleton, Textarea } from '@app/web/ui';
import { type FormEvent, useState } from 'react';
import { ErrorState, isUnavailableError, UnavailableState } from '@/components/states';
import { useMeQuery } from '@/features/auth/auth-api';
import { useNow } from '@/lib/use-now';
import { evidenceUrl, useGetBillingOverviewQuery, useSubmitPaymentMutation } from '../billing-api';
import { billingNotice, formatBillingDate, SUBSCRIPTION_STATUS_LABELS } from '../billing-text';

const PAYMENT_STATUS_LABELS = {
  SUBMITTED: 'Waiting for verification',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
} as const;

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function rupeesToMinor(value: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim().replace(/,/g, ''));
  if (!match) {
    return null;
  }
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function PaymentForm({
  organizationId,
  invoices,
  timezone,
}: {
  organizationId: string;
  invoices: Invoice[];
  timezone: string;
}) {
  const [submit, state] = useSubmitPaymentMutation();
  const first = invoices[0];
  const [invoiceId, setInvoiceId] = useState(first?.id ?? '');
  const [method, setMethod] = useState<SubscriptionPaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState(first ? String(first.amountMinor / 100) : '');
  const [paidOn, setPaidOn] = useState(todayIn(timezone));
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    const amountMinor = rupeesToMinor(amount);
    const fields = { invoiceId, method, reference, amountMinor: amountMinor ?? 0, paidOn, note };
    const parsed = submitPaymentFieldsSchema.safeParse(fields);
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        next[String(issue.path[0])] ??= issue.message;
      }
    }
    if (amountMinor === null || amountMinor < 1) {
      next.amountMinor = 'Enter the amount you paid in rupees';
    }
    if (normalizePaymentReference(reference).length < 4) {
      next.reference = 'Enter the transaction or receipt number';
    }
    if (evidence && evidence.size > 5 * 1024 * 1024) {
      next.evidence = 'The receipt must be 5 MB or smaller';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }
    try {
      await submit({ organizationId, fields, evidence }).unwrap();
      setReference('');
      setNote('');
      setEvidence(null);
      setDone(true);
    } catch (caught) {
      setErrors(getFieldErrors(caught as Parameters<typeof getFieldErrors>[0]));
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="grid gap-4 rounded-xl border bg-card p-4"
    >
      <div>
        <h3 className="font-semibold">Record a payment</h3>
        <p className="text-sm text-muted-foreground">
          After paying, enter the transaction details here. An administrator checks it against the
          bank or wallet statement before the invoice is marked paid.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Invoice" error={errors.invoiceId}>
          {(control) => (
            <Select
              {...control}
              value={invoiceId}
              onChange={(event) => {
                setInvoiceId(event.target.value);
                const chosen = invoices.find((invoice) => invoice.id === event.target.value);
                if (chosen) {
                  setAmount(String(chosen.amountMinor / 100));
                }
              }}
            >
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.number} · {formatRupees(invoice.amountMinor)} · due{' '}
                  {formatBillingDate(invoice.dueAt, timezone)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Paid with" error={errors.method}>
          {(control) => (
            <Select
              {...control}
              value={method}
              onChange={(event) => setMethod(event.target.value as SubscriptionPaymentMethod)}
            >
              {SUBSCRIPTION_PAYMENT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {SUBSCRIPTION_PAYMENT_METHOD_LABELS[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Transaction or receipt number" error={errors.reference}>
          {(control) => (
            <Input
              {...control}
              value={reference}
              maxLength={64}
              autoComplete="off"
              onChange={(event) => setReference(event.target.value)}
            />
          )}
        </Field>
        <Field label="Amount paid (Rs)" error={errors.amountMinor}>
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
        </Field>
        <Field label="Date paid" error={errors.paidOn}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={paidOn}
              max={todayIn(timezone)}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          )}
        </Field>
        <Field
          label="Receipt (optional)"
          error={errors.evidence}
          hint="Photo or PDF of the receipt, up to 5 MB."
        >
          {(control) => (
            <Input
              {...control}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => setEvidence(event.target.files?.[0] ?? null)}
            />
          )}
        </Field>
      </div>
      <Field label="Note (optional)" error={errors.note}>
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      {state.error && Object.keys(errors).length === 0 ? (
        <Alert variant="destructive">{getErrorMessage(state.error)}</Alert>
      ) : null}
      {done ? (
        <Alert variant="success" title="Payment recorded">
          We will verify it and update your subscription. This usually takes one working day.
        </Alert>
      ) : null}
      <Button type="submit" disabled={state.isLoading || invoices.length === 0} className="w-fit">
        {state.isLoading ? 'Sending…' : 'Submit payment details'}
      </Button>
    </form>
  );
}

function Summary({ overview }: { overview: BillingOverview }) {
  const { state, subscription } = overview;
  const date = (iso: string | null) => formatBillingDate(iso, state.timezone);
  if (!subscription) {
    return (
      <Alert title="No plan yet">
        Your restaurant is not on a plan yet, so no limits apply. The platform team will set up your
        plan.
      </Alert>
    );
  }
  return (
    <section aria-labelledby="plan-heading" className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="plan-heading" className="text-lg font-semibold">
          {subscription.planName}
        </h2>
        <Badge
          variant={
            state.standing === 'good'
              ? 'success'
              : state.standing === 'grace'
                ? 'warning'
                : 'destructive'
          }
        >
          {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {formatRupees(subscription.priceMinor)} /{' '}
          {subscription.billingInterval === 'MONTHLY' ? 'month' : 'year'}
        </span>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        {subscription.trialEndsAt && subscription.status === 'TRIALING' ? (
          <div>
            <dt className="text-muted-foreground">Trial ends</dt>
            <dd className="font-medium">{date(subscription.trialEndsAt)}</dd>
          </div>
        ) : null}
        {['ACTIVE', 'PAST_DUE'].includes(subscription.status) ? (
          <div>
            <dt className="text-muted-foreground">
              {subscription.cancelAtPeriodEnd ? 'Ends on' : 'Next renewal'}
            </dt>
            <dd className="font-medium">{date(subscription.currentPeriodEnd)}</dd>
          </div>
        ) : null}
        {subscription.graceEndsAt && subscription.status === 'PAST_DUE' ? (
          <div>
            <dt className="text-muted-foreground">Ordering pauses on</dt>
            <dd className="font-medium">{date(subscription.graceEndsAt)}</dd>
          </div>
        ) : null}
        {subscription.suspendedAt && subscription.status === 'SUSPENDED' ? (
          <div>
            <dt className="text-muted-foreground">Suspended since</dt>
            <dd className="font-medium">{date(subscription.suspendedAt)}</dd>
          </div>
        ) : null}
      </dl>
      <table className="w-full max-w-md text-sm">
        <caption className="mb-1 text-left font-medium">What your plan includes</caption>
        <tbody>
          {state.usage.map((entry) => (
            <tr key={entry.resource} className="border-b last:border-0">
              <th scope="row" className="py-1.5 text-left font-normal capitalize">
                {RESOURCE_LABELS[entry.resource][1]}
              </th>
              <td className="py-1.5 text-right tabular-nums">
                {entry.used} of {entry.limit === null ? 'unlimited' : entry.limit}
                {entry.limit !== null && entry.used >= entry.limit ? (
                  <span className="ml-2 text-xs text-muted-foreground">(limit reached)</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Renewal dates use {state.timezone} time. Your data and past orders are never deleted if a
        subscription lapses.
      </p>
    </section>
  );
}

export function BillingPage({ organizationId }: { organizationId: string }) {
  const { data: me } = useMeQuery();
  const role = me?.memberships.find((entry) => entry.organizationId === organizationId)?.role;
  const canPay = role === 'OWNER' || me?.user.platformRole === 'SUPER_ADMIN';
  const overview = useGetBillingOverviewQuery(organizationId);
  const now = useNow(60_000);

  if (isUnavailableError(overview.error)) {
    return <UnavailableState error={overview.error} />;
  }
  if (overview.isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }
  if (!overview.data) {
    return (
      <ErrorState
        error={overview.error}
        onRetry={() => void overview.refetch()}
        retrying={overview.isFetching}
      />
    );
  }
  const data = overview.data;
  const timezone = data.state.timezone;
  const notice = billingNotice(data.state, now);
  const open = data.invoices.filter((invoice) => invoice.status === 'OPEN');

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Your plan, invoices and payments.</p>
      </div>
      {notice ? (
        <Alert variant={notice.tone === 'danger' ? 'destructive' : 'default'} title={notice.title}>
          {notice.detail}
        </Alert>
      ) : null}
      <Summary overview={data} />

      {open.length > 0 && data.paymentInstructions ? (
        <section
          aria-labelledby="how-heading"
          className="grid gap-2 rounded-xl border bg-card p-4 text-sm"
        >
          <h2 id="how-heading" className="font-semibold">
            How to pay
          </h2>
          <p className="whitespace-pre-line">{data.paymentInstructions}</p>
          <p className="text-muted-foreground">
            Use the invoice number as the payment reference where possible.
          </p>
        </section>
      ) : null}

      {canPay && open.length > 0 ? (
        <PaymentForm organizationId={organizationId} invoices={open} timezone={timezone} />
      ) : open.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Only the restaurant owner can record payments.
        </p>
      ) : null}

      <section aria-labelledby="invoices-heading" className="grid gap-3">
        <h2 id="invoices-heading" className="text-lg font-semibold">
          Invoices
        </h2>
        {data.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">Invoices</caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Invoice
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Period
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Due
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{invoice.number}</td>
                    <td className="px-4 py-2">
                      {formatBillingDate(invoice.periodStart, timezone)} –{' '}
                      {formatBillingDate(invoice.periodEnd, timezone)}
                    </td>
                    <td className="px-4 py-2">{formatBillingDate(invoice.dueAt, timezone)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatRupees(invoice.amountMinor)}
                    </td>
                    <td className="px-4 py-2">
                      {invoice.status === 'PAID'
                        ? `Paid ${formatBillingDate(invoice.paidAt, timezone)}`
                        : invoice.status === 'VOID'
                          ? 'Cancelled'
                          : invoice.pendingMinor > 0
                            ? 'Payment being verified'
                            : 'Unpaid'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="payments-heading" className="grid gap-3">
        <h2 id="payments-heading" className="text-lg font-semibold">
          Payments you recorded
        </h2>
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="grid gap-2">
            {data.payments.map((payment) => (
              <li
                key={payment.id}
                className="grid gap-1 rounded-lg border bg-card px-4 py-3 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {formatRupees(payment.amountMinor)} ·{' '}
                    {SUBSCRIPTION_PAYMENT_METHOD_LABELS[payment.method]}
                  </span>
                  <Badge
                    variant={
                      payment.status === 'VERIFIED'
                        ? 'success'
                        : payment.status === 'REJECTED'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </Badge>
                </span>
                <span className="text-muted-foreground">
                  {payment.invoiceNumber} · reference {payment.reference} · paid {payment.paidOn}
                  {payment.submittedBy ? ` · recorded by ${payment.submittedBy}` : ''}
                </span>
                {payment.rejectionReason ? (
                  <span className="text-destructive">Reason: {payment.rejectionReason}</span>
                ) : null}
                {payment.hasEvidence ? (
                  <a
                    href={evidenceUrl(organizationId, payment.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-fit underline underline-offset-4"
                  >
                    View receipt
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
