import { z } from 'zod';
import { orderTypeSchema, paymentMethodSchema } from './checkout.js';

export const REPORT_MAX_DAYS = 366;

const localDate = z.iso.date();

export const reportQuerySchema = z
  .object({
    from: localDate,
    to: localDate,
    branchId: z.uuid().optional(),
  })
  .refine((value) => value.from <= value.to, {
    message: 'The start date must be on or before the end date',
    path: ['from'],
  })
  .refine(
    (value) =>
      (Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86_400_000 <
      REPORT_MAX_DAYS,
    { message: `Choose a range of at most ${REPORT_MAX_DAYS} days`, path: ['to'] },
  );
export type ReportQuery = z.infer<typeof reportQuerySchema>;

const money = z.number().int();

export const salesReportSchema = z.object({
  range: z.object({
    from: localDate,
    to: localDate,
    timezone: z.string(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  }),
  currency: z.string(),
  orders: z.object({
    placed: z.number().int(),
    completed: z.number().int(),
    cancelled: z.number().int(),
    rejected: z.number().int(),
    inProgress: z.number().int(),
  }),
  sales: z.object({
    grossOrderValueMinor: money,
    discountsMinor: money,
    deliveryChargesMinor: money,
    taxMinor: money,
    orderTotalsMinor: money,
    refundsMinor: money,
    estimatedNetSalesMinor: money,
    averageOrderValueMinor: money.nullable(),
  }),
  payments: z.object({
    recordedMinor: money,
    refundedMinor: money,
    count: z.number().int(),
  }),
  byType: z.array(
    z.object({ type: orderTypeSchema, completed: z.number().int(), totalMinor: money }),
  ),
  byPaymentMethod: z.array(
    z.object({ method: paymentMethodSchema, completed: z.number().int(), totalMinor: money }),
  ),
  daily: z.array(
    z.object({
      date: localDate,
      placed: z.number().int(),
      completed: z.number().int(),
      cancelled: z.number().int(),
      orderTotalsMinor: money,
    }),
  ),
  popularItems: z.array(
    z.object({
      productId: z.uuid(),
      name: z.string(),
      quantity: z.number().int(),
      salesMinor: money,
    }),
  ),
});
export type SalesReport = z.infer<typeof salesReportSchema>;

export const REPORT_DEFINITIONS = {
  placed: 'Orders placed in the period, in any status.',
  completed: 'Orders delivered or picked up.',
  cancelled: 'Orders cancelled by the restaurant or the customer, or rejected by the restaurant.',
  grossOrderValue: 'Item prices before discounts, for completed orders.',
  discounts: 'Promo discounts on items and on delivery, for completed orders.',
  deliveryCharges: 'Delivery fees charged after delivery discounts, for completed orders.',
  tax: 'Tax recorded on completed orders (included or added).',
  orderTotals: 'What customers were charged for completed orders, including delivery and tax.',
  refunds: 'Amounts recorded as refunded on payments for completed orders.',
  estimatedNetSales:
    'Gross order value minus discounts and refunds, without delivery charges and tax. This is not profit: food, staff, rent and other costs are not recorded.',
  averageOrderValue: 'Order totals divided by completed orders.',
  recordedPayments:
    'Payments recorded as received in the period (by payment date), minus refunds on them. Cash is recorded when an order is delivered or picked up.',
} as const;
