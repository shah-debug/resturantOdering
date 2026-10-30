import { z } from 'zod';
import { ORGANIZATION_STATUSES, paginatedSchema } from './organizations.js';

export const organizationStatusSchema = z.enum(ORGANIZATION_STATUSES);

export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED',
] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const BILLING_INTERVALS = ['MONTHLY', 'YEARLY'] as const;
export const billingIntervalSchema = z.enum(BILLING_INTERVALS);

export const platformOrganizationQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: organizationStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PlatformOrganizationQuery = z.input<typeof platformOrganizationQuerySchema>;

export const subscriptionSummarySchema = z.object({
  id: z.uuid(),
  planId: z.uuid(),
  planCode: z.string(),
  planName: z.string(),
  status: subscriptionStatusSchema,
  priceMinor: z.number().int(),
  currency: z.string(),
  billingInterval: billingIntervalSchema,
  currentPeriodStart: z.iso.datetime(),
  currentPeriodEnd: z.iso.datetime(),
  trialEndsAt: z.iso.datetime().nullable(),
  canceledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;

export const platformOrganizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: organizationStatusSchema,
  createdAt: z.iso.datetime(),
  onboardingCompletedAt: z.iso.datetime().nullable(),
  owner: z.object({ fullName: z.string(), email: z.string() }).nullable(),
  branchCount: z.number().int(),
  ordersLast30Days: z.number().int(),
  subscription: subscriptionSummarySchema.nullable(),
});
export type PlatformOrganization = z.infer<typeof platformOrganizationSchema>;
export const platformOrganizationPageSchema = paginatedSchema(platformOrganizationSchema);

export const auditEntrySchema = z.object({
  id: z.uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  organizationId: z.uuid().nullable(),
  organizationName: z.string().nullable(),
  actor: z.object({ fullName: z.string(), email: z.string() }).nullable(),
  changes: z.unknown(),
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export const auditPageSchema = paginatedSchema(auditEntrySchema);

export const auditQuerySchema = z.object({
  organizationId: z.uuid().optional(),
  action: z
    .string()
    .trim()
    .regex(/^[a-z_.]{1,80}$/)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditQuery = z.input<typeof auditQuerySchema>;

export const platformOrganizationDetailSchema = platformOrganizationSchema.extend({
  description: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  timezone: z.string(),
  memberCount: z.number().int(),
  branches: z.array(
    z.object({ id: z.uuid(), name: z.string(), city: z.string(), status: z.string() }),
  ),
  subscriptions: z.array(subscriptionSummarySchema),
  activity: z.object({
    ordersLast30Days: z.number().int(),
    completedLast30Days: z.number().int(),
    lastOrderAt: z.iso.datetime().nullable(),
  }),
  recentAudit: z.array(auditEntrySchema),
});
export type PlatformOrganizationDetail = z.infer<typeof platformOrganizationDetailSchema>;

const reasonSchema = z.string().trim().min(5).max(500);

export const organizationStatusChangeSchema = z
  .object({
    status: organizationStatusSchema,
    expectedStatus: organizationStatusSchema,
    reason: reasonSchema,
  })
  .strict();
export type OrganizationStatusChange = z.infer<typeof organizationStatusChangeSchema>;

export const subscriptionAssignmentSchema = z
  .object({
    planId: z.uuid(),
    status: z.enum(['TRIALING', 'ACTIVE']),
    reason: reasonSchema,
  })
  .strict();
export type SubscriptionAssignment = z.infer<typeof subscriptionAssignmentSchema>;

export const planSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceMinor: z.number().int(),
  currency: z.string(),
  billingInterval: billingIntervalSchema,
  maxBranches: z.number().int().nullable(),
  maxProducts: z.number().int().nullable(),
  maxRiders: z.number().int().nullable(),
  trialDays: z.number().int(),
  isActive: z.boolean(),
  activeSubscriptions: z.number().int(),
});
export type Plan = z.infer<typeof planSchema>;
export const planListSchema = z.array(planSchema);

const limitSchema = z.number().int().min(1).max(100_000).nullable().optional();

export const createPlanRequestSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/,
        'Use 3–40 lowercase letters, numbers and hyphens',
      ),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).nullable().optional(),
    priceMinor: z.number().int().min(0).max(100_000_000),
    billingInterval: billingIntervalSchema,
    maxBranches: limitSchema,
    maxProducts: limitSchema,
    maxRiders: limitSchema,
    trialDays: z.number().int().min(0).max(90),
  })
  .strict();
export type CreatePlanRequest = z.input<typeof createPlanRequestSchema>;

export const subscriptionOverviewSchema = z.object({
  byStatus: z.record(subscriptionStatusSchema, z.number().int()),
  byPlan: z.array(
    z.object({
      planId: z.uuid(),
      planName: z.string(),
      active: z.number().int(),
      trialing: z.number().int(),
    }),
  ),
  monthlyRecurringListPriceMinor: z.number().int(),
  trialsEndingIn7Days: z.number().int(),
  restaurantsWithoutSubscription: z.number().int(),
  pastDue: z.array(
    z.object({
      organizationId: z.uuid(),
      organizationName: z.string(),
      planName: z.string(),
      currentPeriodEnd: z.iso.datetime(),
    }),
  ),
});
export type SubscriptionOverview = z.infer<typeof subscriptionOverviewSchema>;

export const platformHealthSchema = z.object({
  database: z.object({ status: z.enum(['up', 'down']), latencyMs: z.number().int() }),
  uptimeSeconds: z.number().int(),
  notifications: z.object({
    pending: z.number().int(),
    failedLast24Hours: z.number().int(),
    oldestPendingMinutes: z.number().int().nullable(),
  }),
  orders: z.object({
    placedLastHour: z.number().int(),
    pendingOlderThan15Minutes: z.number().int(),
  }),
  liveConnections: z.number().int(),
  restaurants: z.record(organizationStatusSchema, z.number().int()),
  checkedAt: z.iso.datetime(),
});
export type PlatformHealth = z.infer<typeof platformHealthSchema>;

export function escapeCsvCell(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}
