import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { RequestMeta } from '../auth/http/request-context.js';

export const AuditAction = {
  Signup: 'auth.signup',
  EmailVerified: 'auth.email_verified',
  LoginSucceeded: 'auth.login_succeeded',
  LoginFailed: 'auth.login_failed',
  AccountLocked: 'auth.account_locked',
  Logout: 'auth.logout',
  LogoutAll: 'auth.logout_all',
  PasswordResetRequested: 'auth.password_reset_requested',
  PasswordReset: 'auth.password_reset',
  PasswordChanged: 'auth.password_changed',
  InvitationAccepted: 'membership.invitation_accepted',
  OrganizationCreated: 'organization.created',
  OrganizationUpdated: 'organization.updated',
  MemberInvited: 'membership.invited',
  MemberUpdated: 'membership.updated',
  MemberRemoved: 'membership.removed',
  BranchCreated: 'branch.created',
  BranchUpdated: 'branch.updated',
  OpeningHoursUpdated: 'branch.opening_hours_updated',
  FulfillmentUpdated: 'branch.fulfillment_updated',
  OnboardingCompleted: 'organization.onboarding_completed',
  CategoryCreated: 'menu.category_created',
  CategoryUpdated: 'menu.category_updated',
  CategoryArchived: 'menu.category_archived',
  CategoriesReordered: 'menu.categories_reordered',
  ProductCreated: 'menu.product_created',
  ProductUpdated: 'menu.product_updated',
  ProductArchived: 'menu.product_archived',
  ProductsReordered: 'menu.products_reordered',
  ProductImageUpdated: 'menu.product_image_updated',
  AddOnGroupCreated: 'menu.add_on_group_created',
  AddOnGroupUpdated: 'menu.add_on_group_updated',
  AddOnGroupArchived: 'menu.add_on_group_archived',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  action: AuditAction;
  actorUserId?: string | null;
  organizationId?: string | null;
  entityType: string;
  entityId?: string | null;
  changes?: Prisma.InputJsonObject;
  meta?: RequestMeta;
}

type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, client: AuditWriter = this.prisma): Promise<void> {
    await client.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        organizationId: entry.organizationId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        ...(entry.changes ? { changes: entry.changes } : {}),
        ipAddress: entry.meta?.ipAddress ?? null,
        userAgent: entry.meta?.userAgent ?? null,
      },
    });
  }
}
