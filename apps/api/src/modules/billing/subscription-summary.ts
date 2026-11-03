import type { SubscriptionSummary } from '@app/contracts';
import type { Prisma } from '../../generated/prisma/client.js';

export const subscriptionSummarySelect = {
  id: true,
  planId: true,
  status: true,
  priceMinor: true,
  currency: true,
  billingInterval: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  trialEndsAt: true,
  graceEndsAt: true,
  suspendedAt: true,
  cancelAtPeriodEnd: true,
  canceledAt: true,
  expiredAt: true,
  createdAt: true,
  plan: { select: { code: true, name: true } },
} satisfies Prisma.SubscriptionSelect;

export type SubscriptionSummaryRow = Prisma.SubscriptionGetPayload<{
  select: typeof subscriptionSummarySelect;
}>;

export function toSubscriptionSummary(row: SubscriptionSummaryRow): SubscriptionSummary {
  return {
    id: row.id,
    planId: row.planId,
    planCode: row.plan.code,
    planName: row.plan.name,
    status: row.status,
    priceMinor: row.priceMinor,
    currency: row.currency,
    billingInterval: row.billingInterval,
    currentPeriodStart: row.currentPeriodStart.toISOString(),
    currentPeriodEnd: row.currentPeriodEnd.toISOString(),
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    graceEndsAt: row.graceEndsAt?.toISOString() ?? null,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    expiredAt: row.expiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
