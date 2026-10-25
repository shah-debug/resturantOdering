import { z } from 'zod';
import { e164PhoneSchema, timeZoneSchema } from './common.js';
import {
  emailSchema,
  fullNameSchema,
  membershipRoleSchema,
  membershipStatusSchema,
} from './auth.js';

export const RESERVED_ORGANIZATION_SLUGS = [
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'dashboard',
  'help',
  'login',
  'mail',
  'platform',
  'static',
  'status',
  'support',
  'www',
] as const;

export const organizationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/,
    'Use 3–63 lowercase letters, numbers and hyphens; start and end with a letter or number',
  )
  .refine(
    (slug) => !(RESERVED_ORGANIZATION_SLUGS as readonly string[]).includes(slug),
    'This address is reserved',
  );

export const organizationNameSchema = z.string().trim().min(2).max(120);

export const logoUrlSchema = z
  .url({ protocol: /^https$/, message: 'Use an https:// image address' })
  .max(2048);

export const ORGANIZATION_STATUSES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;

export const organizationSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(ORGANIZATION_STATUSES),
  currency: z.string(),
  timezone: z.string(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  primaryColor: z.string().nullable(),
  logoUrl: z.string().nullable(),
  description: z.string().nullable(),
  onboardingCompletedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const createOrganizationRequestSchema = z.object({
  name: organizationNameSchema,
  slug: organizationSlugSchema,
});
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;

export const updateOrganizationRequestSchema = z
  .object({
    name: organizationNameSchema.optional(),
    contactEmail: emailSchema.nullable().optional(),
    contactPhone: e164PhoneSchema.nullable().optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex colour such as #B45309')
      .nullable()
      .optional(),
    description: z.string().trim().min(10).max(500).nullable().optional(),
    logoUrl: logoUrlSchema.nullable().optional(),
    timezone: timeZoneSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;

export const memberSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  fullName: z.string(),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  branchId: z.uuid().nullable(),
  invitedAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
});
export type Member = z.infer<typeof memberSchema>;

export const inviteMemberRequestSchema = z.object({
  email: emailSchema,
  fullName: fullNameSchema,
  role: membershipRoleSchema,
  branchId: z.uuid().nullable().optional(),
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

export const updateMemberRequestSchema = z
  .object({
    role: membershipRoleSchema.optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    branchId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  });
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
