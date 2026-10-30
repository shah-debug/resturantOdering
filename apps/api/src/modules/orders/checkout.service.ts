import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type CheckoutQuote,
  checkoutQuoteRequestSchema,
  idempotencyKeySchema,
  isStorefrontSlug,
  maskPhoneNumber,
  type OrderTracking,
  orderTrackingTokenSchema,
  type PlacedOrder,
  placeOrderRequestSchema,
} from '@app/contracts';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception.js';
import { assertValid } from '../../common/validation/schema.js';
import { AppConfig } from '../../config/app-config.js';
import { isUniqueViolation } from '../../database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { publishedOrganization } from '../storefront/storefront-menu.js';
import {
  type CheckoutEvaluation,
  type CheckoutOrganization,
  evaluateCheckout,
} from './checkout-evaluator.js';
import { canTransitionOrderStatus, INITIAL_ORDER_STATUS } from './domain/order-status.js';
import { createTrackingToken, verifyTrackingToken } from './domain/tracking-token.js';

const organizationSelect = {
  id: true,
  slug: true,
  name: true,
  currency: true,
  timezone: true,
} satisfies Prisma.OrganizationSelect;

const trackingSelect = {
  id: true,
  organizationId: true,
  orderNumber: true,
  status: true,
  type: true,
  placedAt: true,
  paymentMethod: true,
  paymentStatus: true,
  currency: true,
  subtotalMinor: true,
  discountMinor: true,
  taxMinor: true,
  taxRateBps: true,
  pricesIncludeTax: true,
  deliveryFeeMinor: true,
  deliveryDiscountMinor: true,
  roundingAdjustmentMinor: true,
  totalMinor: true,
  promotionCode: true,
  customerName: true,
  customerPhone: true,
  deliveryAddressLine: true,
  deliveryArea: true,
  deliveryCity: true,
  deliveryLandmark: true,
  deliveryInstructions: true,
  customerNote: true,
  organization: { select: { name: true, slug: true } },
  branch: {
    select: { name: true, phone: true, addressLine: true, city: true, preparationMinutes: true },
  },
  deliveryZone: { select: { estimatedMinutes: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      productName: true,
      variantName: true,
      quantity: true,
      lineSubtotalMinor: true,
      addOns: { select: { name: true, groupName: true } },
    },
  },
  statusHistory: { orderBy: { id: 'asc' }, select: { toStatus: true, createdAt: true } },
} satisfies Prisma.OrderSelect;

type TrackingRow = Prisma.OrderGetPayload<{ select: typeof trackingSelect }>;

const uuidSchema = z.uuid();
const CUSTOMER_CANCELLATION_REASON = 'Cancelled by the customer';

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');
}

function restaurantNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Restaurant not found');
}

function rejected(evaluation: CheckoutEvaluation): AppException {
  return new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'CHECKOUT_REJECTED',
    evaluation.issues[0]?.message ?? 'This order cannot be placed',
    evaluation.issues.map(({ field, message }) => ({ field, message })),
  );
}

function isOrderabilityViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    /is not available to order|is not available for this product/.test(error.message)
  );
}

function fingerprint(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export interface PlaceOrderResult {
  order: PlacedOrder;
  replayed: boolean;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private async publishedRestaurant(slug: string): Promise<CheckoutOrganization> {
    if (!isStorefrontSlug(slug)) {
      throw restaurantNotFound();
    }
    const organization = await this.prisma.organization.findFirst({
      where: { slug, ...publishedOrganization },
      select: organizationSelect,
    });
    if (!organization) {
      throw restaurantNotFound();
    }
    return organization;
  }

  private token(organizationId: string, orderId: string): string {
    return createTrackingToken(this.config.orderTrackingSecret, organizationId, orderId);
  }

  async quote(slug: string, body: unknown, now = new Date()): Promise<CheckoutQuote> {
    const organization = await this.publishedRestaurant(slug);
    const input = assertValid(checkoutQuoteRequestSchema, body);
    const evaluation = await evaluateCheckout(this.prisma, organization, input, {
      now,
      lock: false,
    });
    return evaluation.quote;
  }

  async placeOrder(
    slug: string,
    idempotencyKey: string | undefined,
    body: unknown,
    now = new Date(),
  ): Promise<PlaceOrderResult> {
    const organization = await this.publishedRestaurant(slug);
    const key = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!key.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Request validation failed',
        [{ field: 'Idempotency-Key', message: 'Send a unique Idempotency-Key header' }],
      );
    }
    const input = assertValid(placeOrderRequestSchema, body);
    const requestFingerprint = fingerprint(input);

    const replay = await this.findReplay(organization.id, key.data, requestFingerprint);
    if (replay) {
      return { order: replay, replayed: true };
    }

    try {
      const order = await this.prisma.$transaction(
        async (tx) => {
          const evaluation = await evaluateCheckout(tx, organization, input, {
            now,
            lock: true,
            customerPhone: input.customer.phone,
          });
          const { pricing, branch } = evaluation;
          if (evaluation.issues.length > 0 || !pricing || !branch) {
            throw rejected(evaluation);
          }
          if (pricing.totalMinor !== input.expectedTotalMinor) {
            throw new AppException(
              HttpStatus.CONFLICT,
              'PRICE_CHANGED',
              'Prices have changed. Please review your order total before placing it.',
              [{ field: 'expectedTotalMinor', message: `The total is now ${pricing.totalMinor}` }],
            );
          }

          if (evaluation.promotion) {
            const redeemed = await tx.$executeRaw`
              UPDATE promotions SET times_redeemed = times_redeemed + 1, updated_at = now()
              WHERE id = ${evaluation.promotion.id}::uuid
                AND organization_id = ${organization.id}::uuid
                AND (usage_limit IS NULL OR times_redeemed < usage_limit)`;
            if (redeemed !== 1) {
              throw new AppException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                'CHECKOUT_REJECTED',
                'This code has been fully redeemed',
                [{ field: 'promoCode', message: 'This code has been fully redeemed' }],
              );
            }
          }

          const [customer] = await tx.$queryRaw<{ id: string; blocked_at: Date | null }[]>`
            INSERT INTO customers (id, organization_id, phone, full_name, updated_at)
            VALUES (${randomUUID()}::uuid, ${organization.id}::uuid, ${input.customer.phone},
                    ${input.customer.name}, now())
            ON CONFLICT (organization_id, phone)
            DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()
            RETURNING id, blocked_at`;
          if (!customer || customer.blocked_at) {
            throw new AppException(
              HttpStatus.UNPROCESSABLE_ENTITY,
              'CHECKOUT_REJECTED',
              'We can’t accept this order online. Please contact the restaurant.',
            );
          }

          const [numbered] = await tx.$queryRaw<{ last_order_number: number }[]>`
            UPDATE organizations SET last_order_number = last_order_number + 1
            WHERE id = ${organization.id}::uuid
            RETURNING last_order_number`;
          if (!numbered) {
            throw restaurantNotFound();
          }

          const delivery = input.fulfillment.type === 'DELIVERY' ? input.fulfillment : null;
          const orderId = randomUUID();
          await tx.order.create({
            data: {
              id: orderId,
              organizationId: organization.id,
              branchId: branch.id,
              customerId: customer.id,
              orderNumber: numbered.last_order_number,
              type: input.fulfillment.type,
              channel: 'STOREFRONT',
              status: INITIAL_ORDER_STATUS,
              paymentMethod: input.paymentMethod,
              paymentStatus: 'UNPAID',
              currency: organization.currency,
              subtotalMinor: pricing.subtotalMinor,
              discountMinor: pricing.discountMinor,
              taxMinor: pricing.taxMinor,
              taxRateBps: branch.taxRateBps,
              pricesIncludeTax: branch.pricesIncludeTax,
              deliveryFeeMinor: pricing.deliveryFeeMinor,
              deliveryDiscountMinor: pricing.deliveryDiscountMinor,
              roundingAdjustmentMinor: pricing.roundingAdjustmentMinor,
              totalMinor: pricing.totalMinor,
              promotionId: evaluation.promotion?.id ?? null,
              promotionCode: evaluation.promotion?.code ?? null,
              customerName: input.customer.name,
              customerPhone: input.customer.phone,
              deliveryZoneId: delivery ? (evaluation.zone?.id ?? null) : null,
              deliveryAddressLine: delivery?.address.addressLine ?? null,
              deliveryArea: delivery?.address.area ?? null,
              deliveryCity: delivery?.address.city ?? null,
              deliveryLandmark: delivery?.address.landmark ?? null,
              deliveryLatitude: delivery?.address.latitude ?? null,
              deliveryLongitude: delivery?.address.longitude ?? null,
              deliveryInstructions: delivery?.instructions ?? null,
              customerNote: input.note ?? null,
              idempotencyKey: key.data,
              idempotencyFingerprint: requestFingerprint,
              placedAt: now,
            },
          });

          const items = evaluation.lines.map((line, index) => ({
            id: randomUUID(),
            line,
            priced: pricing.lines[index],
          }));
          await tx.orderItem.createMany({
            data: items.map(({ id, line, priced }, index) => ({
              id,
              createdAt: new Date(now.getTime() + index),
              organizationId: organization.id,
              orderId,
              productId: line.productId,
              variantId: line.variantId,
              productName: line.productName,
              variantName: line.variantName,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
              addOnsTotalMinor: priced?.addOnsTotalMinor ?? line.addOnsTotalMinor,
              lineSubtotalMinor: priced?.lineSubtotalMinor ?? line.lineSubtotalMinor,
              discountMinor: priced?.discountMinor ?? 0,
              taxMinor: priced?.taxMinor ?? 0,
            })),
          });
          const addOns = items.flatMap(({ id, line }) =>
            line.addOnSnapshots.map((addOn) => ({
              organizationId: organization.id,
              orderItemId: id,
              addOnId: addOn.id,
              groupName: addOn.groupName,
              name: addOn.name,
              unitPriceMinor: addOn.priceMinor,
              quantity: 1,
            })),
          );
          if (addOns.length > 0) {
            await tx.orderItemAddOn.createMany({ data: addOns });
          }
          await tx.orderStatusHistory.create({
            data: {
              organizationId: organization.id,
              orderId,
              fromStatus: null,
              toStatus: INITIAL_ORDER_STATUS,
              actorType: 'CUSTOMER',
            },
          });
          await tx.payment.create({
            data: {
              organizationId: organization.id,
              orderId,
              method: input.paymentMethod,
              status: 'PENDING',
              amountMinor: pricing.totalMinor,
              currency: organization.currency,
            },
          });

          return {
            orderId,
            orderNumber: numbered.last_order_number,
            trackingToken: this.token(organization.id, orderId),
            totalMinor: pricing.totalMinor,
          };
        },
        { timeout: 15_000 },
      );
      return { order, replayed: false };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findReplay(organization.id, key.data, requestFingerprint);
        if (existing) {
          return { order: existing, replayed: true };
        }
      }
      if (isOrderabilityViolation(error)) {
        this.logger.warn('Order rejected by database orderability rules');
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CHECKOUT_REJECTED',
          'Some items just became unavailable. Please review your cart.',
          [{ field: 'items', message: 'Some items just became unavailable' }],
        );
      }
      throw error;
    }
  }

  private async findReplay(
    organizationId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<PlacedOrder | null> {
    const existing = await this.prisma.order.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
      select: { id: true, orderNumber: true, totalMinor: true, idempotencyFingerprint: true },
    });
    if (!existing) {
      return null;
    }
    if (existing.idempotencyFingerprint !== requestFingerprint) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_CONFLICT',
        'This Idempotency-Key was already used for a different order',
      );
    }
    return {
      orderId: existing.id,
      orderNumber: existing.orderNumber,
      trackingToken: this.token(organizationId, existing.id),
      totalMinor: existing.totalMinor,
    };
  }

  private async authorizedOrder(
    slug: string,
    orderId: string,
    token: string | undefined,
  ): Promise<TrackingRow> {
    if (
      !isStorefrontSlug(slug) ||
      !uuidSchema.safeParse(orderId).success ||
      !orderTrackingTokenSchema.safeParse(token).success ||
      !token
    ) {
      throw notFound();
    }
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organization: { slug } },
      select: trackingSelect,
    });
    if (
      !order ||
      !verifyTrackingToken(this.config.orderTrackingSecret, order.organizationId, order.id, token)
    ) {
      throw notFound();
    }
    return order;
  }

  async track(slug: string, orderId: string, token: string | undefined): Promise<OrderTracking> {
    return this.toTracking(await this.authorizedOrder(slug, orderId, token));
  }

  async cancel(slug: string, orderId: string, token: string | undefined): Promise<OrderTracking> {
    const order = await this.authorizedOrder(slug, orderId, token);
    if (
      !canTransitionOrderStatus(order.type, order.status, 'CANCELLED') ||
      order.status !== 'PENDING'
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'This order can no longer be cancelled. Please contact the restaurant.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: order.id, organizationId: order.organizationId, status: 'PENDING' },
        data: { status: 'CANCELLED', cancellationReason: CUSTOMER_CANCELLATION_REASON },
      });
      if (updated.count !== 1) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'CONFLICT',
          'This order can no longer be cancelled. Please contact the restaurant.',
        );
      }
      await tx.orderStatusHistory.create({
        data: {
          organizationId: order.organizationId,
          orderId: order.id,
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          actorType: 'CUSTOMER',
          note: CUSTOMER_CANCELLATION_REASON,
        },
      });
      await tx.payment.updateMany({
        where: { orderId: order.id, organizationId: order.organizationId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });
    return this.track(slug, orderId, token);
  }

  private toTracking(order: TrackingRow): OrderTracking {
    const isDelivery = order.type === 'DELIVERY';
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      restaurant: order.organization,
      branch: {
        name: order.branch.name,
        phone: order.branch.phone,
        addressLine: order.branch.addressLine,
        city: order.branch.city,
      },
      status: order.status,
      timeline: order.statusHistory.map((entry) => ({
        status: entry.toStatus,
        at: entry.createdAt.toISOString(),
      })),
      type: order.type,
      placedAt: order.placedAt.toISOString(),
      estimatedMinutes: isDelivery
        ? (order.deliveryZone?.estimatedMinutes ?? null)
        : order.branch.preparationMinutes,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      customerName: order.customerName,
      customerPhone: maskPhoneNumber(order.customerPhone),
      delivery:
        isDelivery && order.deliveryAddressLine && order.deliveryCity
          ? {
              addressLine: order.deliveryAddressLine,
              area: order.deliveryArea,
              city: order.deliveryCity,
              landmark: order.deliveryLandmark,
              instructions: order.deliveryInstructions,
            }
          : null,
      note: order.customerNote,
      items: order.items.map((item) => ({
        productName: item.productName,
        variantName: item.variantName,
        quantity: item.quantity,
        addOns: item.addOns,
        lineSubtotalMinor: item.lineSubtotalMinor,
      })),
      promotionCode: order.promotionCode,
      totals: {
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        discountMinor: order.discountMinor,
        taxMinor: order.taxMinor,
        taxRateBps: order.taxRateBps,
        pricesIncludeTax: order.pricesIncludeTax,
        deliveryFeeMinor: order.deliveryFeeMinor,
        deliveryDiscountMinor: order.deliveryDiscountMinor,
        roundingAdjustmentMinor: order.roundingAdjustmentMinor,
        totalMinor: order.totalMinor,
      },
      canCancel: order.status === 'PENDING',
    };
  }
}
