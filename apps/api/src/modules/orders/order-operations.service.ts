import { HttpStatus, Injectable } from '@nestjs/common';
import {
  assignRiderRequestSchema,
  ORDER_VIEW_STATUSES,
  ORDER_VIEWS,
  type OrderCounts,
  type OrderDetail,
  type OrderListItem,
  orderListQuerySchema,
  type OrderPage,
  orderTransitionRequestSchema,
} from '@app/contracts';
import { AppException } from '../../common/errors/app.exception.js';
import { assertValid } from '../../common/validation/schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OrderStatus } from '../../generated/prisma/enums.js';
import { Permission } from '../access/permissions.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, OrganizationAccess, RequestMeta } from '../auth/http/request-context.js';
import { canTransitionOrderStatus } from './domain/order-status.js';
import {
  availableTransitions,
  canAssignRider,
  canPerformTransition,
  RIDER_ASSIGNABLE_STATUSES,
} from './domain/order-transitions.js';
import { OrderEventsService } from './order-events.service.js';

const listSelect = {
  id: true,
  orderNumber: true,
  status: true,
  type: true,
  branchId: true,
  customerName: true,
  customerPhone: true,
  deliveryArea: true,
  totalMinor: true,
  paymentMethod: true,
  paymentStatus: true,
  riderId: true,
  placedAt: true,
  statusChangedAt: true,
  branch: { select: { name: true } },
  rider: { select: { id: true, fullName: true, phone: true } },
  customerNote: true,
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      productName: true,
      variantName: true,
      quantity: true,
      addOns: { select: { name: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type ListRow = Prisma.OrderGetPayload<{ select: typeof listSelect }>;

const detailSelect = {
  ...listSelect,
  currency: true,
  subtotalMinor: true,
  discountMinor: true,
  taxMinor: true,
  taxRateBps: true,
  pricesIncludeTax: true,
  deliveryFeeMinor: true,
  deliveryDiscountMinor: true,
  roundingAdjustmentMinor: true,
  promotionCode: true,
  cancellationReason: true,
  deliveryAddressLine: true,
  deliveryCity: true,
  deliveryLandmark: true,
  deliveryInstructions: true,
  completedAt: true,
  cancelledAt: true,
  organization: { select: { name: true } },
  deliveryZone: { select: { name: true } },
  branch: { select: { id: true, name: true, phone: true, addressLine: true, city: true } },
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      productName: true,
      variantName: true,
      quantity: true,
      unitPriceMinor: true,
      lineSubtotalMinor: true,
      note: true,
      addOns: { select: { name: true, groupName: true, unitPriceMinor: true } },
    },
  },
  statusHistory: {
    orderBy: { id: 'asc' },
    select: {
      fromStatus: true,
      toStatus: true,
      actorType: true,
      note: true,
      createdAt: true,
      changedByUser: { select: { fullName: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type DetailRow = Prisma.OrderGetPayload<{ select: typeof detailSelect }>;

const CLOSING_STATUSES: readonly OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REJECTED];
const DONE_STATUSES: readonly OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.COMPLETED];

function orderNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');
}

function conflict(message: string): AppException {
  return new AppException(HttpStatus.CONFLICT, 'CONFLICT', message);
}

export function branchScope(access: OrganizationAccess): { branchId?: string } {
  return access.branchId ? { branchId: access.branchId } : {};
}

@Injectable()
export class OrderOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: OrderEventsService,
  ) {}

  private toListItem(row: ListRow, access: OrganizationAccess): OrderListItem {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      type: row.type,
      branchId: row.branchId,
      branchName: row.branch.name,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      deliveryArea: row.deliveryArea,
      itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
      lines: row.items.map((item) => ({
        productName: item.productName,
        variantName: item.variantName,
        quantity: item.quantity,
        addOns: item.addOns.map((addOn) => addOn.name),
      })),
      customerNote: row.customerNote,
      totalMinor: row.totalMinor,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      rider: row.rider,
      placedAt: row.placedAt.toISOString(),
      statusChangedAt: row.statusChangedAt.toISOString(),
      availableTransitions: availableTransitions(row, access.permissions),
    };
  }

  private baseWhere(
    access: OrganizationAccess,
    query: { branchId?: string | undefined },
  ): Prisma.OrderWhereInput {
    const scope = branchScope(access);
    return {
      organizationId: access.organizationId,
      ...(scope.branchId
        ? { branchId: scope.branchId }
        : query.branchId
          ? { branchId: query.branchId }
          : {}),
    };
  }

  async list(access: OrganizationAccess, rawQuery: unknown): Promise<OrderPage> {
    const query = assertValid(orderListQuerySchema, rawQuery);
    const search = query.search?.replace(/^#/, '');
    const number = search && /^\d{1,9}$/.test(search) ? Number(search) : null;
    const where: Prisma.OrderWhereInput = {
      ...this.baseWhere(access, query),
      status: { in: [...ORDER_VIEW_STATUSES[query.view]] },
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            placedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              ...(number !== null ? [{ orderNumber: number }] : []),
              { customerName: { contains: search, mode: 'insensitive' as const } },
              { customerPhone: { contains: search.replace(/\s/g, '') } },
            ],
          }
        : {}),
    };
    const active = ['new', 'accepted', 'preparing', 'ready', 'out_for_delivery'].includes(
      query.view,
    );
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: listSelect,
        orderBy: active
          ? [{ placedAt: 'asc' }, { id: 'asc' }]
          : [{ statusChangedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toListItem(row, access)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async counts(access: OrganizationAccess, rawQuery: unknown): Promise<OrderCounts> {
    const query = assertValid(orderListQuerySchema.pick({ branchId: true }), rawQuery);
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      where: this.baseWhere(access, query),
      _count: { _all: true },
    });
    const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
    return Object.fromEntries(
      ORDER_VIEWS.map((view) => [
        view,
        ORDER_VIEW_STATUSES[view].reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0),
      ]),
    ) as OrderCounts;
  }

  private async findScoped(access: OrganizationAccess, orderId: string): Promise<DetailRow> {
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      throw orderNotFound();
    }
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId: access.organizationId, ...branchScope(access) },
      select: detailSelect,
    });
    if (!order) {
      throw orderNotFound();
    }
    return order;
  }

  async detail(access: OrganizationAccess, orderId: string): Promise<OrderDetail> {
    return this.toDetail(await this.findScoped(access, orderId), access);
  }

  private toDetail(row: DetailRow, access: OrganizationAccess): OrderDetail {
    return {
      ...this.toListItem(row, access),
      restaurantName: row.organization.name,
      cancellationReason: row.cancellationReason,
      delivery:
        row.type === 'DELIVERY' && row.deliveryAddressLine && row.deliveryCity
          ? {
              addressLine: row.deliveryAddressLine,
              area: row.deliveryArea,
              city: row.deliveryCity,
              landmark: row.deliveryLandmark,
              instructions: row.deliveryInstructions,
              zoneName: row.deliveryZone?.name ?? null,
            }
          : null,
      branch: row.branch,
      items: row.items,
      totals: {
        currency: row.currency,
        subtotalMinor: row.subtotalMinor,
        discountMinor: row.discountMinor,
        taxMinor: row.taxMinor,
        taxRateBps: row.taxRateBps,
        pricesIncludeTax: row.pricesIncludeTax,
        deliveryFeeMinor: row.deliveryFeeMinor,
        deliveryDiscountMinor: row.deliveryDiscountMinor,
        roundingAdjustmentMinor: row.roundingAdjustmentMinor,
        totalMinor: row.totalMinor,
      },
      promotionCode: row.promotionCode,
      timeline: row.statusHistory.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        actorType: entry.actorType,
        actorName: entry.changedByUser?.fullName ?? null,
        note: entry.note,
        at: entry.createdAt.toISOString(),
      })),
      canAssignRider: canAssignRider(row, access.permissions),
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    };
  }

  async transition(
    access: OrganizationAccess,
    auth: AuthContext,
    orderId: string,
    body: unknown,
    meta: RequestMeta,
  ): Promise<OrderDetail> {
    const dto = assertValid(orderTransitionRequestSchema, body);
    const order = await this.findScoped(access, orderId);

    if (order.status !== dto.expectedStatus) {
      throw conflict(`This order was updated by someone else and is now ${order.status}.`);
    }
    if (!canTransitionOrderStatus(order.type, order.status, dto.to)) {
      throw conflict(`An order cannot move from ${order.status} to ${dto.to}.`);
    }
    if (!canPerformTransition(access.permissions, dto.to)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'You do not have permission to do this',
      );
    }
    if (dto.to === OrderStatus.OUT_FOR_DELIVERY && !order.riderId) {
      throw conflict('Assign a rider before sending the order out.');
    }

    const reason = dto.reason ?? null;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          organizationId: access.organizationId,
          status: dto.expectedStatus,
        },
        data: {
          status: dto.to,
          ...(CLOSING_STATUSES.includes(dto.to) ? { cancellationReason: reason } : {}),
          ...(DONE_STATUSES.includes(dto.to) && order.paymentMethod === 'CASH'
            ? { paymentStatus: 'PAID' }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw conflict('This order was updated by someone else. Refresh and try again.');
      }
      await tx.orderStatusHistory.create({
        data: {
          organizationId: access.organizationId,
          orderId: order.id,
          fromStatus: dto.expectedStatus,
          toStatus: dto.to,
          actorType: 'STAFF',
          changedByUserId: auth.user.id,
          note: reason,
        },
      });

      if (CLOSING_STATUSES.includes(dto.to)) {
        await tx.payment.updateMany({
          where: { orderId: order.id, organizationId: access.organizationId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      }
      if (DONE_STATUSES.includes(dto.to) && order.paymentMethod === 'CASH') {
        await tx.payment.updateMany({
          where: { orderId: order.id, organizationId: access.organizationId, status: 'PENDING' },
          data: { status: 'SUCCEEDED', paidAt: now, collectedByRiderId: order.riderId },
        });
      }

      if (order.riderId) {
        if (dto.to === OrderStatus.OUT_FOR_DELIVERY) {
          await tx.rider.updateMany({
            where: { id: order.riderId, organizationId: access.organizationId },
            data: { availability: 'ON_DELIVERY' },
          });
        } else if (
          order.status === OrderStatus.OUT_FOR_DELIVERY ||
          order.status === OrderStatus.DELIVERY_FAILED
        ) {
          await this.releaseRider(tx, access.organizationId, order.riderId);
        }
      }

      await this.audit.record(
        {
          action: AuditAction.OrderStatusChanged,
          actorUserId: auth.user.id,
          organizationId: access.organizationId,
          entityType: 'order',
          entityId: order.id,
          changes: { from: dto.expectedStatus, to: dto.to, ...(reason ? { reason } : {}) },
          meta,
        },
        tx,
      );
    });

    this.events.publish(access.organizationId, {
      type: 'order.updated',
      orderId: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      status: dto.to,
      at: now.toISOString(),
    });
    return this.detail(access, order.id);
  }

  private async releaseRider(
    tx: Prisma.TransactionClient,
    organizationId: string,
    riderId: string,
  ): Promise<void> {
    const stillOut = await tx.order.count({
      where: { organizationId, riderId, status: OrderStatus.OUT_FOR_DELIVERY },
    });
    if (stillOut === 0) {
      await tx.rider.updateMany({
        where: { id: riderId, organizationId, availability: 'ON_DELIVERY' },
        data: { availability: 'AVAILABLE' },
      });
    }
  }

  async assignRider(
    access: OrganizationAccess,
    auth: AuthContext,
    orderId: string,
    body: unknown,
    meta: RequestMeta,
  ): Promise<OrderDetail> {
    const dto = assertValid(assignRiderRequestSchema, body);
    const order = await this.findScoped(access, orderId);
    if (!access.permissions.has(Permission.OrdersManage)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'You do not have permission to do this',
      );
    }
    if (order.type !== 'DELIVERY') {
      throw conflict('Pickup orders do not need a rider.');
    }
    if (!RIDER_ASSIGNABLE_STATUSES.includes(order.status)) {
      throw conflict(`A rider cannot be changed while the order is ${order.status}.`);
    }
    if (order.riderId !== dto.expectedRiderId) {
      throw conflict(
        'The rider for this order was changed by someone else. Refresh and try again.',
      );
    }
    if (dto.riderId) {
      const rider = await this.prisma.rider.findFirst({
        where: { id: dto.riderId, organizationId: access.organizationId, status: 'ACTIVE' },
        select: { branchId: true },
      });
      if (!rider) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'VALIDATION_FAILED',
          'Choose an active rider from this restaurant',
          [{ field: 'riderId', message: 'Choose an active rider from this restaurant' }],
        );
      }
      if (rider.branchId !== null && rider.branchId !== order.branchId) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'VALIDATION_FAILED',
          'This rider works at another branch',
          [{ field: 'riderId', message: 'This rider works at another branch' }],
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          organizationId: access.organizationId,
          riderId: dto.expectedRiderId,
          status: { in: [...RIDER_ASSIGNABLE_STATUSES] },
        },
        data: { riderId: dto.riderId },
      });
      if (updated.count !== 1) {
        throw conflict('This order was updated by someone else. Refresh and try again.');
      }
      await this.audit.record(
        {
          action: AuditAction.OrderRiderAssigned,
          actorUserId: auth.user.id,
          organizationId: access.organizationId,
          entityType: 'order',
          entityId: order.id,
          changes: { from: dto.expectedRiderId, to: dto.riderId },
          meta,
        },
        tx,
      );
    });

    this.events.publish(access.organizationId, {
      type: 'order.updated',
      orderId: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      status: order.status,
      at: new Date().toISOString(),
    });
    return this.detail(access, order.id);
  }
}
