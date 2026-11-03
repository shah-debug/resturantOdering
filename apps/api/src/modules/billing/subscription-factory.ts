import type { Plan, Prisma } from '../../generated/prisma/client.js';
import { localDateOf } from '../../common/time/zoned-dates.js';
import {
  addLocalDaysTo,
  anchorDayOf,
  billingPeriod,
  localDayStart,
} from './domain/billing-calendar.js';

type Db = Prisma.TransactionClient;

export interface StartedSubscription {
  id: string;
  status: 'TRIALING' | 'ACTIVE';
  firstInvoiceId: string | null;
}

export async function startSubscription(
  db: Db,
  input: {
    organizationId: string;
    timezone: string;
    plan: Plan;
    status: 'TRIALING' | 'ACTIVE';
    trialDays: number;
    now: Date;
  },
): Promise<StartedSubscription> {
  const { plan, timezone, now } = input;
  const today = localDateOf(now, timezone);

  if (input.status === 'TRIALING') {
    const start = localDayStart(now, timezone);
    const trialEnd = addLocalDaysTo(now, input.trialDays, timezone);
    const trialEndDate = localDateOf(trialEnd, timezone);
    const anchorDay = anchorDayOf(trialEndDate);
    const subscription = await db.subscription.create({
      data: {
        organizationId: input.organizationId,
        planId: plan.id,
        status: 'TRIALING',
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        currentPeriodStart: start,
        currentPeriodEnd: trialEnd,
        trialEndsAt: trialEnd,
        billingAnchorDay: anchorDay,
        statusChangedAt: now,
      },
      select: { id: true },
    });
    const firstPeriod = billingPeriod(trialEndDate, anchorDay, plan.billingInterval, timezone);
    const invoice = await db.subscriptionInvoice.create({
      data: {
        organizationId: input.organizationId,
        subscriptionId: subscription.id,
        periodStart: firstPeriod.start,
        periodEnd: firstPeriod.end,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        dueAt: firstPeriod.start,
      },
      select: { id: true },
    });
    return { id: subscription.id, status: 'TRIALING', firstInvoiceId: invoice.id };
  }

  const anchorDay = anchorDayOf(today);
  const period = billingPeriod(today, anchorDay, plan.billingInterval, timezone);
  const subscription = await db.subscription.create({
    data: {
      organizationId: input.organizationId,
      planId: plan.id,
      status: 'ACTIVE',
      priceMinor: plan.priceMinor,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      billingAnchorDay: anchorDay,
      statusChangedAt: now,
    },
    select: { id: true },
  });
  return { id: subscription.id, status: 'ACTIVE', firstInvoiceId: null };
}

export interface NextPeriodSource {
  id: string;
  organizationId: string;
  currentPeriodEnd: Date;
  billingAnchorDay: number;
  billingInterval: 'MONTHLY' | 'YEARLY';
  priceMinor: number;
  currency: string;
}

export function nextPeriodOf(subscription: NextPeriodSource, timezone: string) {
  return billingPeriod(
    localDateOf(subscription.currentPeriodEnd, timezone),
    subscription.billingAnchorDay,
    subscription.billingInterval,
    timezone,
  );
}

export async function ensureInvoiceFor(
  db: Db,
  subscription: NextPeriodSource,
  period: { start: Date; end: Date },
): Promise<void> {
  await db.subscriptionInvoice.createMany({
    data: [
      {
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        periodStart: period.start,
        periodEnd: period.end,
        amountMinor: subscription.priceMinor,
        currency: subscription.currency,
        dueAt: period.start,
      },
    ],
    skipDuplicates: true,
  });
}
