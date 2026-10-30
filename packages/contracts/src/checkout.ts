import { z } from 'zod';
import { e164PhoneSchema } from './common.js';
import { CART_LIMITS } from './storefront.js';

export const PAYMENT_METHODS = ['CASH', 'CARD', 'JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const ORDER_TYPES = ['DELIVERY', 'PICKUP'] as const;
export const orderTypeSchema = z.enum(ORDER_TYPES);
export type OrderType = z.infer<typeof orderTypeSchema>;

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const ORDER_PAYMENT_STATUSES = [
  'UNPAID',
  'PENDING',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export const orderPaymentStatusSchema = z.enum(ORDER_PAYMENT_STATUSES);
export type OrderPaymentStatus = z.infer<typeof orderPaymentStatusSchema>;

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const ORDER_TOKEN_HEADER = 'X-Order-Token';
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,64}$/, 'Use 16–64 letters, numbers, hyphens or underscores');
export const orderTrackingTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

const PK_LOCAL_MOBILE = /^0?(3\d{9})$/;
const PK_INTERNATIONAL = /^(?:\+|00)?92(3\d{9})$/;

export function normalizePhoneNumber(input: string): string | null {
  const compact = input.replace(/[\s()-]/g, '');
  const local = PK_LOCAL_MOBILE.exec(compact) ?? PK_INTERNATIONAL.exec(compact);
  if (local?.[1]) {
    return `+92${local[1]}`;
  }
  return e164PhoneSchema.safeParse(compact).success ? compact : null;
}

export const checkoutItemSchema = z
  .object({
    productId: z.uuid(),
    variantId: z.uuid(),
    addOnIds: z
      .array(z.uuid())
      .max(30)
      .refine((ids) => new Set(ids).size === ids.length, 'Each extra can be chosen once'),
    quantity: z.number().int().min(1).max(CART_LIMITS.maxQuantityPerLine),
  })
  .strict();
export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

function deliveryAddress<T extends z.ZodType>(addressLine: T) {
  return z
    .object({
      addressLine,
      area: z.string().trim().min(2).max(120),
      city: z.string().trim().min(2).max(80),
      landmark: optionalText(160),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
    })
    .strict()
    .refine(
      (address) =>
        (typeof address.latitude === 'number') === (typeof address.longitude === 'number'),
      { message: 'Send both coordinates or neither', path: ['latitude'] },
    );
}

export const deliveryAddressSchema = deliveryAddress(z.string().trim().min(5).max(255));
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;

const quoteAddressSchema = deliveryAddress(z.string().trim().max(255).optional());

function fulfillment<T extends z.ZodType>(address: T) {
  return z.discriminatedUnion('type', [
    z.object({ type: z.literal('PICKUP') }).strict(),
    z
      .object({
        type: z.literal('DELIVERY'),
        address,
        instructions: optionalText(500),
      })
      .strict(),
  ]);
}

export const fulfillmentSchema = fulfillment(deliveryAddressSchema);
export type Fulfillment = z.infer<typeof fulfillmentSchema>;

const checkoutFields = {
  branchId: z.uuid(),
  paymentMethod: paymentMethodSchema,
  promoCode: z
    .string()
    .trim()
    .toUpperCase()
    .transform((value) => (value.length === 0 ? null : value))
    .pipe(z.string().regex(PROMO_CODE_PATTERN, 'Enter a valid code').nullable())
    .nullable()
    .optional(),
  items: z.array(checkoutItemSchema).min(1, 'Your cart is empty').max(CART_LIMITS.maxLines),
};

export const checkoutQuoteRequestSchema = z
  .object({ ...checkoutFields, fulfillment: fulfillment(quoteAddressSchema) })
  .strict();
export type CheckoutQuoteRequest = z.input<typeof checkoutQuoteRequestSchema>;

export const placeOrderRequestSchema = z
  .object({
    ...checkoutFields,
    fulfillment: fulfillmentSchema,
    customer: z
      .object({
        name: z.string().trim().min(2).max(120),
        phone: e164PhoneSchema,
      })
      .strict(),
    note: optionalText(500),
    expectedTotalMinor: z.number().int().min(0),
  })
  .strict();
export type PlaceOrderRequest = z.input<typeof placeOrderRequestSchema>;

export const CHECKOUT_ISSUE_CODES = [
  'STORE_CLOSED',
  'BRANCH_UNAVAILABLE',
  'FULFILLMENT_UNAVAILABLE',
  'ITEM_UNAVAILABLE',
  'DELIVERY_UNAVAILABLE',
  'MINIMUM_ORDER_NOT_MET',
  'PROMOTION_INVALID',
  'PAYMENT_METHOD_UNAVAILABLE',
] as const;
export const checkoutIssueCodeSchema = z.enum(CHECKOUT_ISSUE_CODES);

export const checkoutIssueSchema = z.object({
  code: checkoutIssueCodeSchema,
  field: z.string(),
  message: z.string(),
});
export type CheckoutIssue = z.infer<typeof checkoutIssueSchema>;

export const pricedAddOnSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  groupName: z.string(),
  priceMinor: z.number().int().min(0),
});

export const pricedLineSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid(),
  productName: z.string(),
  variantName: z.string(),
  addOns: z.array(pricedAddOnSchema),
  quantity: z.number().int().min(1),
  unitPriceMinor: z.number().int().min(0),
  addOnsTotalMinor: z.number().int().min(0),
  lineSubtotalMinor: z.number().int().min(0),
});
export type PricedLine = z.infer<typeof pricedLineSchema>;

export const priceBreakdownSchema = z.object({
  currency: z.string(),
  subtotalMinor: z.number().int().min(0),
  discountMinor: z.number().int().min(0),
  taxMinor: z.number().int().min(0),
  taxRateBps: z.number().int().min(0),
  pricesIncludeTax: z.boolean(),
  deliveryFeeMinor: z.number().int().min(0),
  deliveryDiscountMinor: z.number().int().min(0),
  roundingAdjustmentMinor: z.number().int(),
  totalMinor: z.number().int().min(0),
});
export type PriceBreakdown = z.infer<typeof priceBreakdownSchema>;

export const checkoutQuoteSchema = z.object({
  lines: z.array(pricedLineSchema),
  totals: priceBreakdownSchema.nullable(),
  promotion: z.object({ code: z.string(), name: z.string() }).nullable(),
  estimatedMinutes: z.number().int().nullable(),
  paymentMethods: z.array(paymentMethodSchema),
  issues: z.array(checkoutIssueSchema),
  canPlaceOrder: z.boolean(),
});
export type CheckoutQuote = z.infer<typeof checkoutQuoteSchema>;

export const placedOrderSchema = z.object({
  orderId: z.uuid(),
  orderNumber: z.number().int().min(1),
  trackingToken: orderTrackingTokenSchema,
  totalMinor: z.number().int().min(0),
});
export type PlacedOrder = z.infer<typeof placedOrderSchema>;

export const orderTrackingSchema = z.object({
  orderId: z.uuid(),
  orderNumber: z.number().int(),
  restaurant: z.object({ name: z.string(), slug: z.string() }),
  branch: z.object({
    name: z.string(),
    phone: z.string().nullable(),
    addressLine: z.string(),
    city: z.string(),
  }),
  status: orderStatusSchema,
  timeline: z.array(z.object({ status: orderStatusSchema, at: z.iso.datetime() })),
  type: orderTypeSchema,
  placedAt: z.iso.datetime(),
  estimatedMinutes: z.number().int().nullable(),
  paymentMethod: paymentMethodSchema,
  paymentStatus: orderPaymentStatusSchema,
  customerName: z.string(),
  customerPhone: z.string(),
  delivery: z
    .object({
      addressLine: z.string(),
      area: z.string().nullable(),
      city: z.string(),
      landmark: z.string().nullable(),
      instructions: z.string().nullable(),
    })
    .nullable(),
  note: z.string().nullable(),
  items: z.array(
    z.object({
      productName: z.string(),
      variantName: z.string(),
      quantity: z.number().int(),
      addOns: z.array(z.object({ name: z.string(), groupName: z.string() })),
      lineSubtotalMinor: z.number().int(),
    }),
  ),
  promotionCode: z.string().nullable(),
  totals: priceBreakdownSchema,
  canCancel: z.boolean(),
});
export type OrderTracking = z.infer<typeof orderTrackingSchema>;

export function maskPhoneNumber(phone: string): string {
  if (phone.length <= 7) {
    return phone;
  }
  return `${phone.slice(0, 6)}${'•'.repeat(phone.length - 9)}${phone.slice(-3)}`;
}
