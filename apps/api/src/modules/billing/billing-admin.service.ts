import { HttpStatus, Injectable } from '@nestjs/common';
import {
  cancelSubscriptionRequestSchema,
  type Paginated,
  type PlatformPayment,
  platformPaymentQuerySchema,
  reviewPaymentRequestSchema,
  updatePlanRequestSchema,
} from '@app/contracts';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception.js';
import { localDateOf } from '../../common/time/zoned-dates.js';
import { assertValid } from '../../common/validation/schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, RequestMeta } from '../auth/http/request-context.js';
import { anchorDayOf, billingPeriod } from './domain/billing-calendar.js';
import { canTransitionSubscription } from './domain/subscription-status.js';
import { enqueueBillingEmail } from './billing-notifications.js';
import { paymentSelect, toPaymentRecord } from './billing-records.js';
import { type LifecycleResult, BillingLifecycleService } from './billing-lifecycle.service.js';

const platformPaymentSelect = {
  ...paymentSelect,
  organization: { select: { name: true } },
  invoice: {
    select: {
      number: true,
      amountMinor: true,
      status: true,
      subscription: { select: { status: true } },
    },
  },
} satisfies Prisma.SubscriptionPaymentSelect;

type PlatformPaymentRow = Prisma.SubscriptionPaymentGetPayload<{
  select: typeof platformPaymentSelect;
}>;

function toPlatformPayment(row: PlatformPaymentRow): PlatformPayment {
  return {
    ...toPaymentRecord(row),
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    invoiceAmountMinor: row.invoice.amountMinor,
    invoiceStatus: row.invoice.status,
    subscriptionStatus: row.invoice.subscription.status,
    submittedByEmail: row.submittedBy?.email ?? null,
    reviewedBy: row.reviewedBy?.fullName ?? null,
  };
}

function conflict(message: string): AppException {
  return new AppException(HttpStatus.CONFLICT, 'CONFLICT', message);
}

function notFound(what: string): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
}

@Injectable()
export class BillingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lifecycle: BillingLifecycleService,
  ) {}

  async listPayments(rawQuery: unknown): Promise<Paginated<PlatformPayment>> {
    const query = assertValid(platformPaymentQuerySchema, rawQuery);
    const where: Prisma.SubscriptionPaymentWhereInput = {
      status: query.status,
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.subscriptionPayment.count({ where }),
      this.prisma.subscriptionPayment.findMany({
        where,
        orderBy:
          query.status === 'SUBMITTED'
            ? [{ submittedAt: 'asc' }, { id: 'asc' }]
            : [{ reviewedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: platformPaymentSelect,
      }),
    ]);
    return {
      items: rows.map(toPlatformPayment),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async review(
    auth: AuthContext,
    paymentId: string,
    body: unknown,
    meta: RequestMeta,
    now = new Date(),
  ): Promise<PlatformPayment> {
    const dto = assertValid(reviewPaymentRequestSchema, body);
    if (!z.uuid().safeParse(paymentId).success) {
      throw notFound('Payment');
    }
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        amountMinor: true,
        reference: true,
        method: true,
        submittedByUserId: true,
        invoice: {
          select: {
            id: true,
            number: true,
            status: true,
            amountMinor: true,
            periodStart: true,
            periodEnd: true,
            subscription: {
              select: {
                id: true,
                status: true,
                billingInterval: true,
                plan: { select: { name: true } },
                organization: { select: { name: true, timezone: true } },
              },
            },
          },
        },
      },
    });
    if (!payment) {
      throw notFound('Payment');
    }
    if (payment.status !== 'SUBMITTED') {
      throw conflict(`This payment was already ${payment.status.toLowerCase()}.`);
    }
    if (payment.submittedByUserId === auth.user.id) {
      throw conflict('You submitted this payment, so another administrator must review it.');
    }
    const invoice = payment.invoice;
    const subscription = invoice.subscription;
    const timezone = subscription.organization.timezone;
    const emailPayload = {
      organizationName: subscription.organization.name,
      planName: subscription.plan.name,
      timezone,
      invoiceNumber: invoice.number,
      amountMinor: payment.amountMinor,
      dueAt: null,
      graceEndsAt: null,
      reason: dto.decision === 'REJECT' ? dto.reason : null,
    };

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscriptionPayment.updateMany({
        where: { id: payment.id, status: 'SUBMITTED' },
        data:
          dto.decision === 'VERIFY'
            ? { status: 'VERIFIED', reviewedByUserId: auth.user.id, reviewedAt: now }
            : {
                status: 'REJECTED',
                reviewedByUserId: auth.user.id,
                reviewedAt: now,
                rejectionReason: dto.reason,
              },
      });
      if (updated.count !== 1) {
        throw conflict('This payment was just reviewed by someone else.');
      }
      await this.audit.record(
        {
          action:
            dto.decision === 'VERIFY'
              ? AuditAction.BillingPaymentVerified
              : AuditAction.BillingPaymentRejected,
          actorUserId: auth.user.id,
          organizationId: payment.organizationId,
          entityType: 'subscription_payment',
          entityId: payment.id,
          changes: {
            invoice: invoice.number,
            method: payment.method,
            reference: payment.reference,
            amountMinor: payment.amountMinor,
            ...(dto.decision === 'REJECT' ? { reason: dto.reason } : {}),
          },
          meta,
        },
        tx,
      );

      if (dto.decision === 'REJECT') {
        await enqueueBillingEmail(
          tx,
          payment.organizationId,
          'billing.payment_rejected',
          `billing.payment_rejected:${payment.id}`,
          emailPayload,
        );
        return;
      }

      await enqueueBillingEmail(
        tx,
        payment.organizationId,
        'billing.payment_verified',
        `billing.payment_verified:${payment.id}`,
        emailPayload,
      );
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM subscription_invoices WHERE id = ${invoice.id}::uuid FOR UPDATE`;
      if (locked?.status !== 'OPEN') {
        return;
      }
      const verified = await tx.subscriptionPayment.aggregate({
        where: { invoiceId: invoice.id, status: 'VERIFIED' },
        _sum: { amountMinor: true },
      });
      if ((verified._sum.amountMinor ?? 0) < invoice.amountMinor) {
        return;
      }

      let period = { start: invoice.periodStart, end: invoice.periodEnd };
      let anchor: number | null = null;
      if (subscription.status === 'SUSPENDED') {
        const today = localDateOf(now, timezone);
        anchor = anchorDayOf(today);
        const restart = billingPeriod(today, anchor, subscription.billingInterval, timezone);
        period = { start: restart.start, end: restart.end };
      }
      await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt: now,
          ...(anchor !== null
            ? { periodStart: period.start, periodEnd: period.end, dueAt: period.start }
            : {}),
        },
      });

      if (
        (subscription.status === 'PAST_DUE' || subscription.status === 'SUSPENDED') &&
        period.start <= now &&
        canTransitionSubscription(subscription.status, 'ACTIVE')
      ) {
        const activated = await tx.subscription.updateMany({
          where: { id: subscription.id, status: subscription.status },
          data: {
            status: 'ACTIVE',
            statusChangedAt: now,
            graceEndsAt: null,
            suspendedAt: null,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            ...(anchor !== null ? { billingAnchorDay: anchor } : {}),
          },
        });
        if (activated.count === 1) {
          await this.audit.record(
            {
              action: AuditAction.BillingSubscriptionStatusChanged,
              actorUserId: auth.user.id,
              organizationId: payment.organizationId,
              entityType: 'subscription',
              entityId: subscription.id,
              changes: {
                from: subscription.status,
                to: 'ACTIVE',
                reason:
                  subscription.status === 'SUSPENDED'
                    ? 'reactivated_after_payment'
                    : 'payment_verified',
                periodStart: period.start.toISOString(),
                periodEnd: period.end.toISOString(),
              },
              meta,
            },
            tx,
          );
        }
      }
    });

    const row = await this.prisma.subscriptionPayment.findUniqueOrThrow({
      where: { id: payment.id },
      select: platformPaymentSelect,
    });
    return toPlatformPayment(row);
  }

  async cancel(
    auth: AuthContext,
    organizationId: string,
    body: unknown,
    meta: RequestMeta,
    now = new Date(),
  ): Promise<void> {
    const dto = assertValid(cancelSubscriptionRequestSchema, body);
    if (!z.uuid().safeParse(organizationId).success) {
      throw notFound('Restaurant');
    }
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] } },
      select: { id: true, status: true, cancelAtPeriodEnd: true },
    });
    if (!subscription) {
      throw conflict('This restaurant has no current subscription.');
    }
    if (dto.mode === 'PERIOD_END' && !['TRIALING', 'ACTIVE'].includes(subscription.status)) {
      throw conflict(
        'Only trialing or active subscriptions can be cancelled at the end of the period.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.updateMany({
        where: { id: subscription.id, status: subscription.status },
        data:
          dto.mode === 'NOW'
            ? { status: 'CANCELED', canceledAt: now, statusChangedAt: now }
            : { cancelAtPeriodEnd: true },
      });
      if (updated.count !== 1) {
        throw conflict('The subscription was just changed. Refresh and try again.');
      }
      if (dto.mode === 'NOW') {
        await tx.subscriptionInvoice.updateMany({
          where: { subscriptionId: subscription.id, status: 'OPEN' },
          data: { status: 'VOID', voidedAt: now },
        });
      }
      await this.audit.record(
        {
          action: AuditAction.PlatformSubscriptionCanceled,
          actorUserId: auth.user.id,
          organizationId,
          entityType: 'subscription',
          entityId: subscription.id,
          changes: { from: subscription.status, mode: dto.mode, reason: dto.reason },
          meta,
        },
        tx,
      );
    });
  }

  async updatePlan(
    auth: AuthContext,
    planId: string,
    body: unknown,
    meta: RequestMeta,
  ): Promise<void> {
    const dto = assertValid(updatePlanRequestSchema, body);
    if (!z.uuid().safeParse(planId).success) {
      throw notFound('Plan');
    }
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw notFound('Plan');
    }
    if (dto.isDefault === true && (dto.isActive ?? plan.isActive) === false) {
      throw conflict('Activate the plan before making it the default.');
    }
    if (dto.isActive === false && plan.isDefault && dto.isDefault !== false) {
      throw conflict('Choose another default plan before deactivating this one.');
    }
    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.plan.updateMany({
          where: { isDefault: true, id: { not: planId } },
          data: { isDefault: false },
        });
      }
      await tx.plan.update({
        where: { id: planId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.priceMinor !== undefined ? { priceMinor: dto.priceMinor } : {}),
          ...(dto.maxBranches !== undefined ? { maxBranches: dto.maxBranches } : {}),
          ...(dto.maxProducts !== undefined ? { maxProducts: dto.maxProducts } : {}),
          ...(dto.maxRiders !== undefined ? { maxRiders: dto.maxRiders } : {}),
          ...(dto.maxMembers !== undefined ? { maxMembers: dto.maxMembers } : {}),
          ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
          ...(dto.graceDays !== undefined ? { graceDays: dto.graceDays } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
      await this.audit.record(
        {
          action: AuditAction.PlatformPlanUpdated,
          actorUserId: auth.user.id,
          entityType: 'plan',
          entityId: planId,
          changes: { code: plan.code, ...dto },
          meta,
        },
        tx,
      );
    });
  }

  async runLifecycle(auth: AuthContext, meta: RequestMeta): Promise<LifecycleResult> {
    const result = await this.lifecycle.run(new Date());
    await this.audit.record({
      action: AuditAction.PlatformBillingRun,
      actorUserId: auth.user.id,
      entityType: 'billing',
      changes: { ...result },
      meta,
    });
    return result;
  }
}
