import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ErrorReporter } from '../../common/observability/error-reporter.js';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { SubscriptionStatus } from '../../generated/prisma/enums.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { addLocalDaysTo, wholeLocalDaysBetween } from './domain/billing-calendar.js';
import {
  canTransitionSubscription,
  CURRENT_SUBSCRIPTION_STATUSES,
} from './domain/subscription-status.js';
import { type BillingTemplate, enqueueBillingEmail } from './billing-notifications.js';
import { ensureInvoiceFor, nextPeriodOf } from './subscription-factory.js';

export const INVOICE_LEAD_DAYS = 7;
export const RENEWAL_REMINDER_DAYS = [7, 3, 1] as const;
const MAX_CATCH_UP_PERIODS = 24;

export function reminderThreshold(daysLeft: number): number | null {
  if (daysLeft <= 0) {
    return null;
  }
  return [...RENEWAL_REMINDER_DAYS].sort((a, b) => a - b).find((days) => daysLeft <= days) ?? null;
}
const BATCH = 200;

const subscriptionSelect = {
  id: true,
  organizationId: true,
  status: true,
  priceMinor: true,
  currency: true,
  billingInterval: true,
  billingAnchorDay: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  graceEndsAt: true,
  suspendedAt: true,
  plan: { select: { name: true, graceDays: true } },
  organization: { select: { name: true, timezone: true } },
} satisfies Prisma.SubscriptionSelect;

type Row = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>;

export interface LifecycleResult {
  renewed: number;
  pastDue: number;
  suspended: number;
  expired: number;
  canceled: number;
  invoicesCreated: number;
  remindersQueued: number;
}

@Injectable()
export class BillingLifecycleService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly errors: ErrorReporter,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.billing.lifecycleIntervalSeconds;
    if (seconds > 0) {
      this.timer = setInterval(() => void this.tick(), seconds * 1000);
      this.timer.unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.inFlight;
  }

  private tick(): Promise<void> {
    this.inFlight ??= this.work().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async work(): Promise<void> {
    try {
      await this.run(new Date());
    } catch (error) {
      this.errors.report(error, { source: 'worker', task: 'billing-lifecycle' });
    }
  }

  async run(now: Date): Promise<LifecycleResult> {
    const result: LifecycleResult = {
      renewed: 0,
      pastDue: 0,
      suspended: 0,
      expired: 0,
      canceled: 0,
      invoicesCreated: 0,
      remindersQueued: 0,
    };

    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.subscription.findMany({
        where: { status: { in: [...CURRENT_SUBSCRIPTION_STATUSES] } },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: subscriptionSelect,
      });
      for (const subscription of page) {
        await this.advance(subscription, now, result);
      }
      if (page.length < BATCH) {
        return result;
      }
      cursor = page.at(-1)?.id;
    }
  }

  private async transition(
    tx: Prisma.TransactionClient,
    row: Row,
    to: SubscriptionStatus,
    data: Prisma.SubscriptionUpdateManyMutationInput,
    reason: string,
    now: Date,
  ): Promise<boolean> {
    if (!canTransitionSubscription(row.status, to)) {
      throw new Error(`Invalid subscription transition ${row.status} → ${to}`);
    }
    const updated = await tx.subscription.updateMany({
      where: { id: row.id, status: row.status },
      data: { ...data, status: to, statusChangedAt: now },
    });
    if (updated.count !== 1) {
      return false;
    }
    await this.audit.record(
      {
        action: AuditAction.BillingSubscriptionStatusChanged,
        organizationId: row.organizationId,
        entityType: 'subscription',
        entityId: row.id,
        changes: { from: row.status, to, reason },
      },
      tx,
    );
    return true;
  }

  private payload(
    row: Row,
    extra: Partial<{
      invoiceNumber: string | null;
      amountMinor: number | null;
      dueAt: Date | null;
      graceEndsAt: Date | null;
    }>,
  ) {
    return {
      organizationName: row.organization.name,
      planName: row.plan.name,
      timezone: row.organization.timezone,
      invoiceNumber: extra.invoiceNumber ?? null,
      amountMinor: extra.amountMinor ?? null,
      dueAt: extra.dueAt?.toISOString() ?? null,
      graceEndsAt: extra.graceEndsAt?.toISOString() ?? null,
      reason: null,
    };
  }

  private async remind(
    tx: Prisma.TransactionClient,
    row: Row,
    template: BillingTemplate,
    key: string,
    payload: ReturnType<BillingLifecycleService['payload']>,
    result: LifecycleResult,
  ): Promise<void> {
    const before = await tx.notification.count({
      where: { organizationId: row.organizationId, dedupeKey: key },
    });
    await enqueueBillingEmail(tx, row.organizationId, template, key, payload);
    const after = await tx.notification.count({
      where: { organizationId: row.organizationId, dedupeKey: key },
    });
    result.remindersQueued += after - before;
  }

  private async advance(initial: Row, now: Date, result: LifecycleResult): Promise<void> {
    let row: Row | null = initial;
    for (let step = 0; row && step < MAX_CATCH_UP_PERIODS; step += 1) {
      const current: Row = row;
      const changed = await this.prisma.$transaction(async (tx) =>
        this.step(tx, current, now, result),
      );
      if (!changed) {
        return;
      }
      row = await this.prisma.subscription.findUnique({
        where: { id: current.id },
        select: subscriptionSelect,
      });
    }
  }

  private async step(
    tx: Prisma.TransactionClient,
    row: Row,
    now: Date,
    result: LifecycleResult,
  ): Promise<boolean> {
    const timezone = row.organization.timezone;
    const next = nextPeriodOf(row, timezone);

    if (row.status === 'TRIALING' || row.status === 'ACTIVE') {
      if (
        !row.cancelAtPeriodEnd &&
        row.currentPeriodEnd.getTime() - now.getTime() <= INVOICE_LEAD_DAYS * 86_400_000
      ) {
        const before = await tx.subscriptionInvoice.count({ where: { subscriptionId: row.id } });
        await ensureInvoiceFor(tx, row, next);
        result.invoicesCreated +=
          (await tx.subscriptionInvoice.count({ where: { subscriptionId: row.id } })) - before;
      }

      if (row.currentPeriodEnd > now) {
        const invoice = await tx.subscriptionInvoice.findUnique({
          where: {
            subscriptionId_periodStart: { subscriptionId: row.id, periodStart: next.start },
          },
        });
        if (invoice?.status === 'OPEN') {
          const daysLeft = wholeLocalDaysBetween(now, invoice.dueAt, timezone);
          const threshold = reminderThreshold(daysLeft);
          if (threshold !== null) {
            await this.remind(
              tx,
              row,
              'billing.renewal_due',
              `billing.renewal_due:${invoice.id}:${threshold}`,
              this.payload(row, {
                invoiceNumber: invoice.number,
                amountMinor: invoice.amountMinor,
                dueAt: invoice.dueAt,
              }),
              result,
            );
          }
        }
        return false;
      }

      if (row.cancelAtPeriodEnd) {
        const done = await this.transition(
          tx,
          row,
          'CANCELED',
          { canceledAt: now },
          'cancelled_at_period_end',
          now,
        );
        if (done) {
          await tx.subscriptionInvoice.updateMany({
            where: { subscriptionId: row.id, status: 'OPEN' },
            data: { status: 'VOID', voidedAt: now },
          });
          result.canceled += 1;
        }
        return false;
      }

      await ensureInvoiceFor(tx, row, next);
      const invoice = await tx.subscriptionInvoice.findUniqueOrThrow({
        where: { subscriptionId_periodStart: { subscriptionId: row.id, periodStart: next.start } },
      });
      if (invoice.status === 'PAID') {
        const period = { currentPeriodStart: next.start, currentPeriodEnd: next.end };
        const done =
          row.status === 'TRIALING'
            ? await this.transition(tx, row, 'ACTIVE', period, 'trial_ended_with_paid_invoice', now)
            : (
                await tx.subscription.updateMany({
                  where: { id: row.id, status: 'ACTIVE', currentPeriodEnd: row.currentPeriodEnd },
                  data: period,
                })
              ).count === 1;
        if (done) {
          result.renewed += 1;
        }
        return done;
      }

      const graceEndsAt = addLocalDaysTo(next.start, row.plan.graceDays, timezone);
      const done = await this.transition(
        tx,
        row,
        'PAST_DUE',
        { currentPeriodStart: next.start, currentPeriodEnd: next.end, graceEndsAt },
        'invoice_unpaid_at_period_start',
        now,
      );
      if (done) {
        result.pastDue += 1;
        await this.remind(
          tx,
          row,
          'billing.past_due',
          `billing.past_due:${invoice.id}`,
          this.payload(row, {
            invoiceNumber: invoice.number,
            amountMinor: invoice.amountMinor,
            dueAt: invoice.dueAt,
            graceEndsAt,
          }),
          result,
        );
      }
      return done;
    }

    if (row.status === 'PAST_DUE' && row.graceEndsAt) {
      if (row.graceEndsAt > now) {
        if (wholeLocalDaysBetween(now, row.graceEndsAt, timezone) <= 1) {
          const invoice = await tx.subscriptionInvoice.findFirst({
            where: { subscriptionId: row.id, status: 'OPEN' },
            orderBy: { periodStart: 'desc' },
          });
          await this.remind(
            tx,
            row,
            'billing.grace_ending',
            `billing.grace_ending:${row.id}:${row.graceEndsAt.toISOString()}`,
            this.payload(row, {
              invoiceNumber: invoice?.number ?? null,
              amountMinor: invoice?.amountMinor ?? null,
              graceEndsAt: row.graceEndsAt,
            }),
            result,
          );
        }
        return false;
      }
      const done = await this.transition(
        tx,
        row,
        'SUSPENDED',
        { suspendedAt: now },
        'grace_period_ended',
        now,
      );
      if (done) {
        result.suspended += 1;
        await this.remind(
          tx,
          row,
          'billing.suspended',
          `billing.suspended:${row.id}:${now.toISOString().slice(0, 10)}`,
          this.payload(row, {}),
          result,
        );
      }
      return done;
    }

    if (row.status === 'SUSPENDED' && row.suspendedAt) {
      const expiresAt = new Date(
        row.suspendedAt.getTime() + this.config.billing.expireAfterDays * 86_400_000,
      );
      if (expiresAt > now) {
        return false;
      }
      const done = await this.transition(
        tx,
        row,
        'EXPIRED',
        { expiredAt: now },
        'suspended_too_long',
        now,
      );
      if (done) {
        await tx.subscriptionInvoice.updateMany({
          where: { subscriptionId: row.id, status: 'OPEN' },
          data: { status: 'VOID', voidedAt: now },
        });
        result.expired += 1;
      }
      return false;
    }
    return false;
  }
}
