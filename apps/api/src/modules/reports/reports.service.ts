import { HttpStatus, Injectable } from '@nestjs/common';
import { type ReportQuery, reportQuerySchema, type SalesReport, toCsv } from '@app/contracts';
import { AppException } from '../../common/errors/app.exception.js';
import { roundHalfUpDivide } from '../../common/money/money.js';
import {
  addLocalDays,
  localDateOf,
  localDaysBetween,
  startOfLocalDay,
} from '../../common/time/zoned-dates.js';
import { assertValid } from '../../common/validation/schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OrderStatus } from '../../generated/prisma/enums.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, OrganizationAccess, RequestMeta } from '../auth/http/request-context.js';

export const COMPLETED_STATUSES = [OrderStatus.DELIVERED, OrderStatus.COMPLETED];
export const EXPORT_ROW_LIMIT = 20_000;
const POPULAR_ITEMS = 10;

interface ReportScope {
  query: ReportQuery;
  timezone: string;
  currency: string;
  startsAt: Date;
  endsAt: Date;
  where: Prisma.OrderWhereInput;
  branchId: string | null;
}

interface DailyRow {
  day: string;
  placed: bigint;
  completed: bigint;
  cancelled: bigint;
  totals: bigint | null;
}

function sum(value: number | null | undefined): number {
  return value ?? 0;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async scope(access: OrganizationAccess, rawQuery: unknown): Promise<ReportScope> {
    const query = assertValid(reportQuerySchema, rawQuery);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: access.organizationId },
      select: { timezone: true, currency: true },
    });
    const branchId = access.branchId ?? query.branchId ?? null;
    if (branchId && !access.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId: access.organizationId },
        select: { id: true },
      });
      if (!branch) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_FAILED',
          'Request validation failed',
          [{ field: 'branchId', message: 'Choose a branch of this restaurant' }],
        );
      }
    }
    const startsAt = startOfLocalDay(query.from, organization.timezone);
    const endsAt = startOfLocalDay(addLocalDays(query.to, 1), organization.timezone);
    return {
      query,
      timezone: organization.timezone,
      currency: organization.currency,
      startsAt,
      endsAt,
      branchId,
      where: {
        organizationId: access.organizationId,
        ...(branchId ? { branchId } : {}),
        placedAt: { gte: startsAt, lt: endsAt },
      },
    };
  }

  async sales(access: OrganizationAccess, rawQuery: unknown): Promise<SalesReport> {
    const scope = await this.scope(access, rawQuery);
    const completedWhere: Prisma.OrderWhereInput = {
      ...scope.where,
      status: { in: COMPLETED_STATUSES },
    };

    const [statusCounts, completed, includedTax, refunds, byType, byMethod, payments] =
      await Promise.all([
        this.prisma.order.groupBy({
          by: ['status'],
          where: scope.where,
          _count: { _all: true },
        }),
        this.prisma.order.aggregate({
          where: completedWhere,
          _count: { _all: true },
          _sum: {
            subtotalMinor: true,
            discountMinor: true,
            deliveryFeeMinor: true,
            deliveryDiscountMinor: true,
            taxMinor: true,
            totalMinor: true,
          },
        }),
        this.prisma.order.aggregate({
          where: { ...completedWhere, pricesIncludeTax: true },
          _sum: { taxMinor: true },
        }),
        this.prisma.payment.aggregate({
          where: { organizationId: access.organizationId, order: completedWhere },
          _sum: { refundedAmountMinor: true },
        }),
        this.prisma.order.groupBy({
          by: ['type'],
          where: completedWhere,
          _count: { _all: true },
          _sum: { totalMinor: true },
          orderBy: { type: 'asc' },
        }),
        this.prisma.order.groupBy({
          by: ['paymentMethod'],
          where: completedWhere,
          _count: { _all: true },
          _sum: { totalMinor: true },
          orderBy: { paymentMethod: 'asc' },
        }),
        this.prisma.payment.aggregate({
          where: {
            organizationId: access.organizationId,
            status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
            paidAt: { gte: scope.startsAt, lt: scope.endsAt },
            ...(scope.branchId ? { order: { branchId: scope.branchId } } : {}),
          },
          _count: { _all: true },
          _sum: { amountMinor: true, refundedAmountMinor: true },
        }),
      ]);

    const counts = new Map(statusCounts.map((row) => [row.status, row._count._all]));
    const count = (...statuses: OrderStatus[]) =>
      statuses.reduce((total, status) => total + (counts.get(status) ?? 0), 0);
    const placed = [...counts.values()].reduce((total, value) => total + value, 0);
    const completedCount = completed._count._all;
    const cancelled = count(OrderStatus.CANCELLED);
    const rejected = count(OrderStatus.REJECTED);

    const gross = sum(completed._sum.subtotalMinor);
    const orderDiscount = sum(completed._sum.discountMinor);
    const deliveryDiscount = sum(completed._sum.deliveryDiscountMinor);
    const orderTotals = sum(completed._sum.totalMinor);
    const refundsMinor = sum(refunds._sum.refundedAmountMinor);
    const recorded = sum(payments._sum.amountMinor);
    const recordedRefunds = sum(payments._sum.refundedAmountMinor);

    const [daily, popular] = await Promise.all([
      this.daily(scope),
      this.popularItems(completedWhere),
    ]);

    return {
      range: {
        from: scope.query.from,
        to: scope.query.to,
        timezone: scope.timezone,
        startsAt: scope.startsAt.toISOString(),
        endsAt: scope.endsAt.toISOString(),
      },
      currency: scope.currency,
      orders: {
        placed,
        completed: completedCount,
        cancelled,
        rejected,
        inProgress: placed - completedCount - cancelled - rejected,
      },
      sales: {
        grossOrderValueMinor: gross,
        discountsMinor: orderDiscount + deliveryDiscount,
        deliveryChargesMinor: sum(completed._sum.deliveryFeeMinor) - deliveryDiscount,
        taxMinor: sum(completed._sum.taxMinor),
        orderTotalsMinor: orderTotals,
        refundsMinor,
        estimatedNetSalesMinor:
          gross - orderDiscount - sum(includedTax._sum.taxMinor) - refundsMinor,
        averageOrderValueMinor:
          completedCount > 0 ? roundHalfUpDivide(orderTotals, completedCount) : null,
      },
      payments: {
        recordedMinor: recorded - recordedRefunds,
        refundedMinor: recordedRefunds,
        count: payments._count._all,
      },
      byType: byType.map((row) => ({
        type: row.type,
        completed: row._count._all,
        totalMinor: sum(row._sum.totalMinor),
      })),
      byPaymentMethod: byMethod.map((row) => ({
        method: row.paymentMethod,
        completed: row._count._all,
        totalMinor: sum(row._sum.totalMinor),
      })),
      daily,
      popularItems: popular,
    };
  }

  private async daily(scope: ReportScope): Promise<SalesReport['daily']> {
    const days = localDaysBetween(scope.query.from, scope.query.to, scope.timezone);
    const organizationId = scope.where.organizationId as string;
    const rows = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT d.day,
             count(o.id) AS placed,
             count(o.id) FILTER (WHERE o.status IN ('DELIVERED', 'COMPLETED')) AS completed,
             count(o.id) FILTER (WHERE o.status IN ('CANCELLED', 'REJECTED')) AS cancelled,
             sum(o.total_minor) FILTER (WHERE o.status IN ('DELIVERED', 'COMPLETED')) AS totals
      FROM unnest(
        ${days.map((day) => day.date)}::text[],
        ${days.map((day) => day.startsAt)}::timestamptz[],
        ${days.map((day) => day.endsAt)}::timestamptz[]
      ) AS d(day, starts_at, ends_at)
      LEFT JOIN orders o
        ON o.organization_id = ${organizationId}::uuid
       AND o.placed_at >= d.starts_at
       AND o.placed_at < d.ends_at
       AND (${scope.branchId}::uuid IS NULL OR o.branch_id = ${scope.branchId}::uuid)
      GROUP BY d.day
      ORDER BY d.day`;
    return rows.map((row) => ({
      date: row.day,
      placed: Number(row.placed),
      completed: Number(row.completed),
      cancelled: Number(row.cancelled),
      orderTotalsMinor: Number(row.totals ?? 0),
    }));
  }

  private async popularItems(
    completedWhere: Prisma.OrderWhereInput,
  ): Promise<SalesReport['popularItems']> {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: completedWhere },
      _sum: { quantity: true, lineSubtotalMinor: true },
      orderBy: [{ _sum: { quantity: 'desc' } }, { productId: 'asc' }],
      take: POPULAR_ITEMS,
    });
    const names = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((row) => row.productId) } },
      select: { id: true, name: true },
    });
    const byId = new Map(names.map((product) => [product.id, product.name]));
    return grouped.map((row) => ({
      productId: row.productId,
      name: byId.get(row.productId) ?? 'Removed item',
      quantity: sum(row._sum.quantity),
      salesMinor: sum(row._sum.lineSubtotalMinor),
    }));
  }

  async ordersCsv(
    access: OrganizationAccess,
    auth: AuthContext,
    rawQuery: unknown,
    meta: RequestMeta,
  ): Promise<{ filename: string; body: string }> {
    const scope = await this.scope(access, rawQuery);
    const total = await this.prisma.order.count({ where: scope.where });
    if (total > EXPORT_ROW_LIMIT) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        `This range has ${total} orders. Export at most ${EXPORT_ROW_LIMIT} at a time by choosing a shorter range.`,
        [{ field: 'to', message: 'Choose a shorter date range' }],
      );
    }
    const orders = await this.prisma.order.findMany({
      where: scope.where,
      orderBy: [{ placedAt: 'asc' }, { orderNumber: 'asc' }],
      select: {
        orderNumber: true,
        placedAt: true,
        status: true,
        type: true,
        paymentMethod: true,
        paymentStatus: true,
        subtotalMinor: true,
        discountMinor: true,
        deliveryFeeMinor: true,
        deliveryDiscountMinor: true,
        taxMinor: true,
        roundingAdjustmentMinor: true,
        totalMinor: true,
        branch: { select: { name: true } },
        items: { select: { quantity: true } },
      },
    });
    const rupees = (minor: number) => (minor / 100).toFixed(2);
    const rows: (string | number | null)[][] = [
      [
        'Order number',
        'Placed (local time)',
        'Local date',
        'Branch',
        'Type',
        'Status',
        'Items',
        'Payment method',
        'Payment status',
        'Subtotal',
        'Discount',
        'Delivery fee',
        'Delivery discount',
        'Tax',
        'Rounding',
        'Total',
      ],
      ...orders.map((order) => [
        order.orderNumber,
        new Intl.DateTimeFormat('en-GB', {
          timeZone: scope.timezone,
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(order.placedAt),
        localDateOf(order.placedAt, scope.timezone),
        order.branch.name,
        order.type,
        order.status,
        order.items.reduce((count, item) => count + item.quantity, 0),
        order.paymentMethod,
        order.paymentStatus,
        rupees(order.subtotalMinor),
        rupees(order.discountMinor),
        rupees(order.deliveryFeeMinor),
        rupees(order.deliveryDiscountMinor),
        rupees(order.taxMinor),
        rupees(order.roundingAdjustmentMinor),
        rupees(order.totalMinor),
      ]),
    ];
    await this.audit.record({
      action: AuditAction.ReportExported,
      actorUserId: auth.user.id,
      organizationId: access.organizationId,
      entityType: 'report',
      entityId: 'orders',
      changes: {
        from: scope.query.from,
        to: scope.query.to,
        branchId: scope.branchId,
        rows: orders.length,
      },
      meta,
    });
    return {
      filename: `orders-${scope.query.from}-to-${scope.query.to}.csv`,
      body: toCsv(rows),
    };
  }
}
