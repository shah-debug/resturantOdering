import { z } from 'zod';
import {
  orderPaymentStatusSchema,
  orderStatusSchema,
  orderTypeSchema,
  paymentMethodSchema,
  priceBreakdownSchema,
  type OrderStatus,
} from './checkout.js';
import { e164PhoneSchema } from './common.js';
import { paginatedSchema } from './organizations.js';

export const ORDER_VIEWS = [
  'new',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;
export const orderViewSchema = z.enum(ORDER_VIEWS);
export type OrderView = z.infer<typeof orderViewSchema>;

export const ORDER_VIEW_STATUSES: Readonly<Record<OrderView, readonly OrderStatus[]>> = {
  new: ['PENDING'],
  accepted: ['CONFIRMED'],
  preparing: ['PREPARING'],
  ready: ['READY'],
  out_for_delivery: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED'],
  delivered: ['DELIVERED', 'COMPLETED'],
  cancelled: ['CANCELLED', 'REJECTED'],
};

export const ORDER_VIEW_LABELS: Readonly<Record<OrderView, string>> = {
  new: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function orderViewFor(status: OrderStatus): OrderView {
  const entry = Object.entries(ORDER_VIEW_STATUSES).find(([, statuses]) =>
    statuses.includes(status),
  );
  return (entry?.[0] as OrderView | undefined) ?? 'new';
}

export const REASON_REQUIRED_STATUSES: readonly OrderStatus[] = [
  'REJECTED',
  'CANCELLED',
  'DELIVERY_FAILED',
];

export const orderListQuerySchema = z.object({
  view: orderViewSchema.default('new'),
  branchId: z.uuid().optional(),
  type: orderTypeSchema.optional(),
  search: z.string().trim().max(100).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrderListQuery = z.input<typeof orderListQuerySchema>;

export const orderRiderSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  phone: z.string(),
});

export const orderListItemSchema = z.object({
  id: z.uuid(),
  orderNumber: z.number().int(),
  status: orderStatusSchema,
  type: orderTypeSchema,
  branchId: z.uuid(),
  branchName: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  deliveryArea: z.string().nullable(),
  itemCount: z.number().int(),
  lines: z.array(
    z.object({
      productName: z.string(),
      variantName: z.string(),
      quantity: z.number().int(),
      addOns: z.array(z.string()),
    }),
  ),
  customerNote: z.string().nullable(),
  totalMinor: z.number().int(),
  paymentMethod: paymentMethodSchema,
  paymentStatus: orderPaymentStatusSchema,
  rider: orderRiderSchema.nullable(),
  placedAt: z.iso.datetime(),
  statusChangedAt: z.iso.datetime(),
  availableTransitions: z.array(orderStatusSchema),
});
export type OrderListItem = z.infer<typeof orderListItemSchema>;

export const orderPageSchema = paginatedSchema(orderListItemSchema);
export type OrderPage = z.infer<typeof orderPageSchema>;

export const orderCountsSchema = z.record(orderViewSchema, z.number().int().min(0));
export type OrderCounts = z.infer<typeof orderCountsSchema>;

export const orderDetailSchema = orderListItemSchema.extend({
  cancellationReason: z.string().nullable(),
  delivery: z
    .object({
      addressLine: z.string(),
      area: z.string().nullable(),
      city: z.string(),
      landmark: z.string().nullable(),
      instructions: z.string().nullable(),
      zoneName: z.string().nullable(),
    })
    .nullable(),
  branch: z.object({
    id: z.uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    addressLine: z.string(),
    city: z.string(),
  }),
  items: z.array(
    z.object({
      id: z.uuid(),
      productName: z.string(),
      variantName: z.string(),
      quantity: z.number().int(),
      unitPriceMinor: z.number().int(),
      addOns: z.array(
        z.object({ name: z.string(), groupName: z.string(), unitPriceMinor: z.number().int() }),
      ),
      lineSubtotalMinor: z.number().int(),
      note: z.string().nullable(),
    }),
  ),
  totals: priceBreakdownSchema,
  promotionCode: z.string().nullable(),
  timeline: z.array(
    z.object({
      fromStatus: orderStatusSchema.nullable(),
      toStatus: orderStatusSchema,
      actorType: z.enum(['SYSTEM', 'STAFF', 'CUSTOMER', 'RIDER']),
      actorName: z.string().nullable(),
      note: z.string().nullable(),
      at: z.iso.datetime(),
    }),
  ),
  canAssignRider: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  restaurantName: z.string(),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

export const orderTransitionRequestSchema = z
  .object({
    to: orderStatusSchema,
    expectedStatus: orderStatusSchema,
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .refine((value) => !REASON_REQUIRED_STATUSES.includes(value.to) || Boolean(value.reason), {
    message: 'Give a reason',
    path: ['reason'],
  });
export type OrderTransitionRequest = z.infer<typeof orderTransitionRequestSchema>;

export const assignRiderRequestSchema = z
  .object({
    riderId: z.uuid().nullable(),
    expectedRiderId: z.uuid().nullable(),
  })
  .strict();
export type AssignRiderRequest = z.infer<typeof assignRiderRequestSchema>;

export const VEHICLE_TYPES = ['MOTORCYCLE', 'BICYCLE', 'CAR', 'ON_FOOT'] as const;
export const vehicleTypeSchema = z.enum(VEHICLE_TYPES);
export const RIDER_AVAILABILITIES = ['OFFLINE', 'AVAILABLE', 'ON_DELIVERY'] as const;
export const riderAvailabilitySchema = z.enum(RIDER_AVAILABILITIES);
export const RIDER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const riderStatusSchema = z.enum(RIDER_STATUSES);

export const riderSchema = z.object({
  id: z.uuid(),
  branchId: z.uuid().nullable(),
  branchName: z.string().nullable(),
  fullName: z.string(),
  phone: z.string(),
  vehicleType: vehicleTypeSchema,
  vehicleNumber: z.string().nullable(),
  status: riderStatusSchema,
  availability: riderAvailabilitySchema,
  activeDeliveries: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type Rider = z.infer<typeof riderSchema>;
export const riderListSchema = z.array(riderSchema);

export const riderUpsertRequestSchema = z
  .object({
    branchId: z.uuid(),
    fullName: z.string().trim().min(2).max(120),
    phone: e164PhoneSchema,
    vehicleType: vehicleTypeSchema,
    vehicleNumber: z
      .string()
      .trim()
      .max(20)
      .transform((value) => (value.length === 0 ? null : value.toUpperCase()))
      .nullable()
      .optional(),
  })
  .strict();
export type RiderUpsertRequest = z.input<typeof riderUpsertRequestSchema>;

export const riderPatchRequestSchema = z
  .object({
    status: riderStatusSchema.optional(),
    availability: z.enum(['OFFLINE', 'AVAILABLE']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type RiderPatchRequest = z.infer<typeof riderPatchRequestSchema>;

export const ORDER_EVENT_TYPES = ['order.created', 'order.updated'] as const;
export const orderEventSchema = z.object({
  type: z.enum(ORDER_EVENT_TYPES),
  orderId: z.uuid(),
  orderNumber: z.number().int(),
  branchId: z.uuid(),
  status: orderStatusSchema,
  at: z.iso.datetime(),
});
export type OrderEvent = z.infer<typeof orderEventSchema>;
