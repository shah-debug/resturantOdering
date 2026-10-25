import { z } from 'zod';

export const MEMBERSHIP_ROLES = [
  'OWNER',
  'MANAGER',
  'ORDER_STAFF',
  'KITCHEN_STAFF',
  'RIDER',
] as const;
export const membershipRoleSchema = z.enum(MEMBERSHIP_ROLES);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const MEMBERSHIP_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED'] as const;
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const PLATFORM_ROLES = ['SUPER_ADMIN', 'SUPPORT'] as const;
export const platformRoleSchema = z.enum(PLATFORM_ROLES);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z.string().trim().toLowerCase().max(320).pipe(z.email());
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`);
export const fullNameSchema = z.string().trim().min(2).max(120);
export const authTokenSchema = z.string().min(20).max(200);

export const signupRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: fullNameSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const emailRequestSchema = z.object({ email: emailSchema });
export type EmailRequest = z.infer<typeof emailRequestSchema>;

export const verifyEmailRequestSchema = z.object({ token: authTokenSchema });
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: authTokenSchema,
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const acceptInvitationRequestSchema = z.object({
  token: authTokenSchema,
  fullName: fullNameSchema.optional(),
  password: passwordSchema.optional(),
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

export const sessionUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  emailVerified: z.boolean(),
  platformRole: platformRoleSchema.nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const membershipSummarySchema = z.object({
  membershipId: z.uuid(),
  organizationId: z.uuid(),
  organizationName: z.string(),
  organizationSlug: z.string(),
  role: membershipRoleSchema,
  branchId: z.uuid().nullable(),
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

export const meResponseSchema = z.object({
  user: sessionUserSchema,
  memberships: z.array(membershipSummarySchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
