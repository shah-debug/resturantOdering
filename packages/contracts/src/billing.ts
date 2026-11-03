import { z } from 'zod';
import { paginatedSchema } from './organizations.js';
import { subscriptionStatusSchema, subscriptionSummarySchema } from './platform.js';

export const STANDINGS = ['unmanaged', 'good', 'grace', 'restricted'] as const;
export const standingSchema = z.enum(STANDINGS);
export type Standing = z.infer<typeof standingSchema>;

export const LIMITED_RESOURCES = ['branches', 'products', 'riders', 'members'] as const;
export const limitedResourceSchema = z.enum(LIMITED_RESOURCES);
export type LimitedResource = z.infer<typeof limitedResourceSchema>;

export const RESOURCE_LABELS: Readonly<Record<LimitedResource, [string, string]>> = {
  branches: ['branch', 'branches'],
  products: ['menu item', 'menu items'],
  riders: ['active rider', 'active riders'],
  members: ['team member', 'team members'],
};

export const usageSchema = z.object({
  resource: limitedResourceSchema,
  used: z.number().int().min(0),
  limit: z.number().int().nullable(),
});
export type Usage = z.infer<typeof usageSchema>;

export const subscriptionStateSchema = z.object({
  standing: standingSchema,
  canTakeOrders: z.boolean(),
  status: subscriptionStatusSchema.nullable(),
  planName: z.string().nullable(),
  trialEndsAt: z.iso.datetime().nullable(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  graceEndsAt: z.iso.datetime().nullable(),
  suspendedAt: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  timezone: z.string(),
  usage: z.array(usageSchema),
});
export type SubscriptionState = z.infer<typeof subscriptionStateSchema>;

export const SUBSCRIPTION_PAYMENT_METHODS = [
  'BANK_TRANSFER',
  'JAZZCASH',
  'EASYPAISA',
  'CASH',
  'OTHER',
] as const;
export const subscriptionPaymentMethodSchema = z.enum(SUBSCRIPTION_PAYMENT_METHODS);
export type SubscriptionPaymentMethod = z.infer<typeof subscriptionPaymentMethodSchema>;

export const SUBSCRIPTION_PAYMENT_METHOD_LABELS: Readonly<
  Record<SubscriptionPaymentMethod, string>
> = {
  BANK_TRANSFER: 'Bank transfer',
  JAZZCASH: 'JazzCash',
  EASYPAISA: 'Easypaisa',
  CASH: 'Cash',
  OTHER: 'Other',
};

export const invoiceStatusSchema = z.enum(['OPEN', 'PAID', 'VOID']);
export const subscriptionPaymentStatusSchema = z.enum(['SUBMITTED', 'VERIFIED', 'REJECTED']);
export type SubscriptionPaymentStatus = z.infer<typeof subscriptionPaymentStatusSchema>;

export const invoiceSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  amountMinor: z.number().int(),
  currency: z.string(),
  status: invoiceStatusSchema,
  dueAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  verifiedMinor: z.number().int(),
  pendingMinor: z.number().int(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const subscriptionPaymentSchema = z.object({
  id: z.uuid(),
  invoiceId: z.uuid(),
  invoiceNumber: z.string(),
  method: subscriptionPaymentMethodSchema,
  amountMinor: z.number().int(),
  currency: z.string(),
  reference: z.string(),
  paidOn: z.iso.date(),
  note: z.string().nullable(),
  hasEvidence: z.boolean(),
  status: subscriptionPaymentStatusSchema,
  submittedAt: z.iso.datetime(),
  submittedBy: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
});
export type SubscriptionPaymentRecord = z.infer<typeof subscriptionPaymentSchema>;

export const billingOverviewSchema = z.object({
  state: subscriptionStateSchema,
  subscription: subscriptionSummarySchema.nullable(),
  invoices: z.array(invoiceSchema),
  payments: z.array(subscriptionPaymentSchema),
  paymentInstructions: z.string().nullable(),
});
export type BillingOverview = z.infer<typeof billingOverviewSchema>;

export function normalizePaymentReference(reference: string): string {
  return reference.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const submitPaymentFieldsSchema = z
  .object({
    invoiceId: z.uuid(),
    method: subscriptionPaymentMethodSchema,
    reference: z
      .string()
      .trim()
      .min(4)
      .max(64)
      .refine(
        (value) => normalizePaymentReference(value).length >= 4,
        'Enter the transaction or receipt number',
      ),
    amountMinor: z.coerce.number().int().min(1).max(100_000_000),
    paidOn: z.iso.date(),
    note: z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value.length === 0 ? null : value))
      .optional(),
  })
  .strict();
export type SubmitPaymentFields = z.input<typeof submitPaymentFieldsSchema>;

export const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

export const platformPaymentQuerySchema = z.object({
  status: subscriptionPaymentStatusSchema.default('SUBMITTED'),
  organizationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PlatformPaymentQuery = z.input<typeof platformPaymentQuerySchema>;

export const platformPaymentSchema = subscriptionPaymentSchema.extend({
  organizationId: z.uuid(),
  organizationName: z.string(),
  invoiceAmountMinor: z.number().int(),
  invoiceStatus: invoiceStatusSchema,
  subscriptionStatus: subscriptionStatusSchema,
  submittedByEmail: z.string().nullable(),
  reviewedBy: z.string().nullable(),
});
export type PlatformPayment = z.infer<typeof platformPaymentSchema>;
export const platformPaymentPageSchema = paginatedSchema(platformPaymentSchema);

export const reviewPaymentRequestSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('VERIFY') }).strict(),
  z.object({ decision: z.literal('REJECT'), reason: z.string().trim().min(5).max(500) }).strict(),
]);
export type ReviewPaymentRequest = z.infer<typeof reviewPaymentRequestSchema>;

export const cancelSubscriptionRequestSchema = z
  .object({
    mode: z.enum(['NOW', 'PERIOD_END']),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export type CancelSubscriptionRequest = z.infer<typeof cancelSubscriptionRequestSchema>;

export function formatLimit(resource: LimitedResource, limit: number): string {
  const [one, many] = RESOURCE_LABELS[resource];
  return `${limit} ${limit === 1 ? one : many}`;
}
