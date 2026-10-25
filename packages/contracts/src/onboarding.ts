import { z } from 'zod';
import { e164PhoneSchema } from './common.js';

export const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 7, label: 'Sunday', short: 'Sun' },
] as const;

export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 09:30');

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export const openingIntervalSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    opensAt: timeOfDaySchema,
    closesAt: timeOfDaySchema,
  })
  .refine((interval) => interval.opensAt !== interval.closesAt, {
    message: 'Opening and closing times must differ',
    path: ['closesAt'],
  });
export type OpeningInterval = z.infer<typeof openingIntervalSchema>;

function weekSpan(interval: OpeningInterval): { start: number; end: number } {
  const opens = timeToMinutes(interval.opensAt);
  const closes = timeToMinutes(interval.closesAt);
  const start = (interval.dayOfWeek - 1) * MINUTES_PER_DAY + opens;
  const duration = closes > opens ? closes - opens : MINUTES_PER_DAY - opens + closes;
  return { start, end: start + duration };
}

export function findOpeningHoursOverlap(
  intervals: readonly OpeningInterval[],
): [number, number] | null {
  const spans = intervals.map(weekSpan);
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = i + 1; j < spans.length; j += 1) {
      const a = spans[i];
      const b = spans[j];
      if (!a || !b) {
        continue;
      }
      for (const shift of [-MINUTES_PER_WEEK, 0, MINUTES_PER_WEEK]) {
        if (a.start < b.end + shift && b.start + shift < a.end) {
          return [i, j];
        }
      }
    }
  }
  return null;
}

export const openingHoursRequestSchema = z
  .object({ intervals: z.array(openingIntervalSchema).max(28) })
  .superRefine((value, ctx) => {
    const overlap = findOpeningHoursOverlap(value.intervals);
    if (overlap) {
      ctx.addIssue({
        code: 'custom',
        path: ['intervals', overlap[1]],
        message: 'This time overlaps another opening period',
      });
    }
  });
export type OpeningHoursRequest = z.infer<typeof openingHoursRequestSchema>;

export const branchNameSchema = z.string().trim().min(2).max(120);
export const addressLineSchema = z.string().trim().min(5).max(255);
export const citySchema = z.string().trim().min(2).max(80);
export const areaSchema = z.string().trim().min(2).max(120);

export const deliverySettingsSchema = z.object({
  feeMinor: z.number().int().min(0).max(1_000_000),
  minimumOrderMinor: z.number().int().min(0).max(10_000_000),
  estimatedMinutes: z.number().int().min(5).max(240),
});
export type DeliverySettings = z.infer<typeof deliverySettingsSchema>;

export const branchSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'CLOSED']),
  isAcceptingOrders: z.boolean(),
  phone: z.string().nullable(),
  addressLine: z.string(),
  area: z.string().nullable(),
  city: z.string(),
  deliveryEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  preparationMinutes: z.number().int(),
  delivery: deliverySettingsSchema.nullable(),
  openingHours: z.array(openingIntervalSchema),
  createdAt: z.iso.datetime(),
});
export type Branch = z.infer<typeof branchSchema>;

export const createBranchRequestSchema = z.object({
  name: branchNameSchema,
  phone: e164PhoneSchema,
  addressLine: addressLineSchema,
  area: areaSchema.nullable().optional(),
  city: citySchema,
});
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;

export const updateBranchRequestSchema = createBranchRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;

export const fulfillmentRequestSchema = z
  .object({
    deliveryEnabled: z.boolean(),
    pickupEnabled: z.boolean(),
    preparationMinutes: z.number().int().min(5).max(240),
    delivery: deliverySettingsSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.deliveryEnabled && !value.pickupEnabled) {
      ctx.addIssue({
        code: 'custom',
        path: ['pickupEnabled'],
        message: 'Offer delivery, pickup or both',
      });
    }
    if (value.deliveryEnabled && !value.delivery) {
      ctx.addIssue({
        code: 'custom',
        path: ['delivery'],
        message: 'Set a delivery fee, minimum order and delivery time',
      });
    }
  });
export type FulfillmentRequest = z.infer<typeof fulfillmentRequestSchema>;

export const slugAvailabilitySchema = z.object({
  slug: z.string(),
  available: z.boolean(),
  reason: z.enum(['taken', 'reserved', 'invalid']).nullable(),
});
export type SlugAvailability = z.infer<typeof slugAvailabilitySchema>;

export const ONBOARDING_STEPS = [
  'restaurant',
  'profile',
  'branch',
  'hours',
  'fulfillment',
  'review',
] as const;
export const onboardingStepIdSchema = z.enum(ONBOARDING_STEPS);
export type OnboardingStepId = z.infer<typeof onboardingStepIdSchema>;

export const READINESS_STATUSES = ['complete', 'missing', 'recommended', 'upcoming'] as const;

export const readinessCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(READINESS_STATUSES),
  step: onboardingStepIdSchema.nullable(),
  detail: z.string().nullable(),
});
export type ReadinessCheck = z.infer<typeof readinessCheckSchema>;

export const onboardingStatusSchema = z.object({
  organizationId: z.uuid(),
  completedAt: z.iso.datetime().nullable(),
  primaryBranchId: z.uuid().nullable(),
  steps: z.array(z.object({ id: onboardingStepIdSchema, complete: z.boolean() })),
  checks: z.array(readinessCheckSchema),
  canComplete: z.boolean(),
});
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;
