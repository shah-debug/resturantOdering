import type { Invoice, SubscriptionPaymentRecord } from '@app/contracts';
import type { Prisma } from '../../generated/prisma/client.js';

export const invoiceSelect = {
  id: true,
  number: true,
  periodStart: true,
  periodEnd: true,
  amountMinor: true,
  currency: true,
  status: true,
  dueAt: true,
  paidAt: true,
  payments: { select: { status: true, amountMinor: true } },
} satisfies Prisma.SubscriptionInvoiceSelect;

export type InvoiceRow = Prisma.SubscriptionInvoiceGetPayload<{ select: typeof invoiceSelect }>;

export function toInvoice(row: InvoiceRow): Invoice {
  const sum = (status: 'VERIFIED' | 'SUBMITTED') =>
    row.payments
      .filter((payment) => payment.status === status)
      .reduce((total, payment) => total + payment.amountMinor, 0);
  return {
    id: row.id,
    number: row.number,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
    dueAt: row.dueAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    verifiedMinor: sum('VERIFIED'),
    pendingMinor: sum('SUBMITTED'),
  };
}

export const paymentSelect = {
  id: true,
  organizationId: true,
  invoiceId: true,
  method: true,
  amountMinor: true,
  currency: true,
  reference: true,
  paidOn: true,
  note: true,
  evidenceKey: true,
  status: true,
  submittedAt: true,
  reviewedAt: true,
  rejectionReason: true,
  invoice: { select: { number: true } },
  submittedBy: { select: { fullName: true, email: true } },
  reviewedBy: { select: { fullName: true } },
} satisfies Prisma.SubscriptionPaymentSelect;

export type PaymentRow = Prisma.SubscriptionPaymentGetPayload<{ select: typeof paymentSelect }>;

export function toPaymentRecord(row: PaymentRow): SubscriptionPaymentRecord {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice.number,
    method: row.method,
    amountMinor: row.amountMinor,
    currency: row.currency,
    reference: row.reference,
    paidOn: row.paidOn.toISOString().slice(0, 10),
    note: row.note,
    hasEvidence: row.evidenceKey !== null,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    submittedBy: row.submittedBy?.fullName ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
  };
}
