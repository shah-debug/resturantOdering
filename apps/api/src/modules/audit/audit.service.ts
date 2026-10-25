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
