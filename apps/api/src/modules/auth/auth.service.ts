import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { MeResponse } from '@app/contracts';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { AppConfig } from '../../config/app-config.js';
import { isUniqueViolation } from '../../database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  AuthTokenPurpose,
  MembershipStatus,
  OrganizationStatus,
  UserStatus,
} from '../../generated/prisma/enums.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { accountExistsEmail, passwordResetEmail, verificationEmail } from '../mail/auth-emails.js';
import { Mailer, type MailMessage } from '../mail/mailer.js';
import { AuthTokenService } from './auth-token.service.js';
import { PasswordHasher } from './crypto/password-hasher.js';
import type {
  AcceptInvitationDto,
  ChangePasswordDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
} from './dto/auth.dto.js';
import type { AuthContext, RequestMeta } from './http/request-context.js';
import { type CreatedSession, SessionRevocationReason, SessionService } from './session.service.js';

function invalidCredentials(): AppException {
  return new AppException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    'Email or password is incorrect',
  );
}

function invalidToken(): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    'INVALID_TOKEN',
    'This link is invalid or has expired',
  );
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly tokens: AuthTokenService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
  ) {}

  async signup(dto: SignupDto, meta: RequestMeta): Promise<void> {
    const passwordHash = await this.hasher.hash(dto.password);
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      await this.deliver(accountExistsEmail(dto.email, this.config.dashboardUrl));
      return;
    }
    try {
      const token = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            fullName: dto.fullName,
            passwordHash,
            passwordChangedAt: new Date(),
          },
          select: { id: true },
        });
        await this.audit.record(
          {
            action: AuditAction.Signup,
            actorUserId: user.id,
            entityType: 'user',
            entityId: user.id,
            meta,
          },
          tx,
        );
        return this.tokens.issue(tx, user.id, AuthTokenPurpose.EMAIL_VERIFICATION);
      });
      await this.deliver(verificationEmail(dto.email, this.config.dashboardUrl, token));
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      await this.deliver(accountExistsEmail(dto.email, this.config.dashboardUrl));
    }
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const consumed = await this.tokens.consume(tx, token, AuthTokenPurpose.EMAIL_VERIFICATION);
      if (!consumed) {
        throw invalidToken();
      }
      await tx.user.updateMany({
        where: { id: consumed.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
      await this.audit.record(
        {
          action: AuditAction.EmailVerified,
          actorUserId: consumed.userId,
          entityType: 'user',
          entityId: consumed.userId,
          meta,
        },
        tx,
      );
    });
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt || user.status !== UserStatus.ACTIVE) {
      return;
    }
    const token = await this.tokens.issue(
      this.prisma,
      user.id,
      AuthTokenPurpose.EMAIL_VERIFICATION,
    );
    await this.deliver(verificationEmail(email, this.config.dashboardUrl, token));
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<{ session: CreatedSession; me: MeResponse }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        emailVerifiedAt: true,
        lockedUntil: true,
        failedLoginAttempts: true,
      },
    });

    if (!user?.passwordHash) {
      await this.hasher.verify(dto.password, await this.getDummyHash());
      await this.audit.record({
        action: AuditAction.LoginFailed,
        actorUserId: user?.id ?? null,
        entityType: 'user',
        entityId: user?.id ?? null,
        changes: { reason: user ? 'no_password' : 'unknown_email' },
        meta,
      });
      throw invalidCredentials();
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
      throw new AppException(
        HttpStatus.LOCKED,
        'ACCOUNT_LOCKED',
        `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    }

    if (!(await this.hasher.verify(dto.password, user.passwordHash))) {
      await this.recordFailedLogin(user.id, user.failedLoginAttempts, meta);
      throw invalidCredentials();
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'This account is not active');
    }
    if (!user.emailVerifiedAt) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'EMAIL_NOT_VERIFIED',
        'Verify your email address before signing in',
      );
    }

    const rehashed = this.hasher.needsRehash(user.passwordHash)
      ? await this.hasher.hash(dto.password)
      : null;
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: now,
          ...(rehashed ? { passwordHash: rehashed } : {}),
        },
      });
      const created = await this.sessions.create(user.id, meta, tx);
      await this.audit.record(
        {
          action: AuditAction.LoginSucceeded,
          actorUserId: user.id,
          entityType: 'session',
          entityId: created.sessionId,
          meta,
        },
        tx,
      );
      return created;
    });

    return { session, me: await this.me(user.id) };
  }

  async logout(auth: AuthContext, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(auth.sessionId, SessionRevocationReason.Logout);
    await this.audit.record({
      action: AuditAction.Logout,
      actorUserId: auth.user.id,
      entityType: 'session',
      entityId: auth.sessionId,
      meta,
    });
  }

  async logoutAll(auth: AuthContext, meta: RequestMeta): Promise<void> {
    const revoked = await this.sessions.revokeAllForUser(
      auth.user.id,
      SessionRevocationReason.LogoutAll,
    );
    await this.audit.record({
      action: AuditAction.LogoutAll,
      actorUserId: auth.user.id,
      entityType: 'user',
      entityId: auth.user.id,
      changes: { revokedSessions: revoked },
      meta,
    });
  }

  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      return;
    }
    const token = await this.tokens.issue(this.prisma, user.id, AuthTokenPurpose.PASSWORD_RESET);
    await this.audit.record({
      action: AuditAction.PasswordResetRequested,
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      meta,
    });
    await this.deliver(passwordResetEmail(email, this.config.dashboardUrl, token));
  }

  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta): Promise<void> {
    const passwordHash = await this.hasher.hash(dto.password);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await this.tokens.consume(tx, dto.token, AuthTokenPurpose.PASSWORD_RESET);
      if (!consumed) {
        throw invalidToken();
      }
      const now = new Date();
      const user = await tx.user.findUniqueOrThrow({
        where: { id: consumed.userId },
        select: { emailVerifiedAt: true },
      });
      await tx.user.update({
        where: { id: consumed.userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
        },
      });
      const revoked = await this.sessions.revokeAllForUser(
        consumed.userId,
        SessionRevocationReason.PasswordReset,
        { client: tx },
      );
      await this.audit.record(
        {
          action: AuditAction.PasswordReset,
          actorUserId: consumed.userId,
          entityType: 'user',
          entityId: consumed.userId,
          changes: { revokedSessions: revoked },
          meta,
        },
        tx,
      );
    });
  }

  async changePassword(
    auth: AuthContext,
    dto: ChangePasswordDto,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { passwordHash: true },
    });
    if (!user.passwordHash || !(await this.hasher.verify(dto.currentPassword, user.passwordHash))) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_CREDENTIALS',
        'Current password is incorrect',
      );
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new ValidationFailedException([
        { field: 'newPassword', message: 'Choose a password different from your current one' },
      ]);
    }
    const passwordHash = await this.hasher.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: auth.user.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      const revoked = await this.sessions.revokeAllForUser(
        auth.user.id,
        SessionRevocationReason.PasswordChanged,
        { exceptSessionId: auth.sessionId, client: tx },
      );
      await this.audit.record(
        {
          action: AuditAction.PasswordChanged,
          actorUserId: auth.user.id,
          entityType: 'user',
          entityId: auth.user.id,
          changes: { revokedOtherSessions: revoked },
          meta,
        },
        tx,
      );
    });
  }

  async acceptInvitation(dto: AcceptInvitationDto, meta: RequestMeta): Promise<void> {
    const passwordHash = dto.password ? await this.hasher.hash(dto.password) : null;
    await this.prisma.$transaction(async (tx) => {
      const consumed = await this.tokens.consume(tx, dto.token, AuthTokenPurpose.INVITATION);
      if (!consumed?.membershipId) {
        throw invalidToken();
      }
      const membership = await tx.membership.findUnique({
        where: { id: consumed.membershipId },
        select: {
          id: true,
          status: true,
          organizationId: true,
          user: { select: { id: true, passwordHash: true, emailVerifiedAt: true } },
        },
      });
      if (!membership || membership.status !== MembershipStatus.INVITED) {
        throw invalidToken();
      }
      const needsPassword = !membership.user.passwordHash;
      if (needsPassword && !passwordHash) {
        throw new ValidationFailedException([
          { field: 'password', message: 'Choose a password to finish creating your account' },
        ]);
      }
      const now = new Date();
      await tx.user.update({
        where: { id: membership.user.id },
        data: {
          emailVerifiedAt: membership.user.emailVerifiedAt ?? now,
          ...(dto.fullName ? { fullName: dto.fullName } : {}),
          ...(needsPassword && passwordHash ? { passwordHash, passwordChangedAt: now } : {}),
        },
      });
      await tx.membership.update({
        where: { id: membership.id },
        data: { status: MembershipStatus.ACTIVE, acceptedAt: now },
      });
      await this.audit.record(
        {
          action: AuditAction.InvitationAccepted,
          actorUserId: membership.user.id,
          organizationId: membership.organizationId,
          entityType: 'membership',
          entityId: membership.id,
          meta,
        },
        tx,
      );
    });
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        emailVerifiedAt: true,
        platformRole: true,
        memberships: {
          where: {
            status: MembershipStatus.ACTIVE,
            organization: { status: OrganizationStatus.ACTIVE },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            branchId: true,
            organization: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerified: user.emailVerifiedAt !== null,
        platformRole: user.platformRole,
      },
      memberships: user.memberships.map((membership) => ({
        membershipId: membership.id,
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        organizationSlug: membership.organization.slug,
        role: membership.role,
        branchId: membership.branchId,
      })),
    };
  }

  private async recordFailedLogin(
    userId: string,
    previousAttempts: number,
    meta: RequestMeta,
  ): Promise<void> {
    const { lockoutThreshold, lockoutDurationMs } = this.config.auth;
    const locked = previousAttempts + 1 >= lockoutThreshold;
    await this.prisma.user.update({
      where: { id: userId },
      data: locked
        ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + lockoutDurationMs) }
        : { failedLoginAttempts: { increment: 1 } },
    });
    await this.audit.record({
      action: locked ? AuditAction.AccountLocked : AuditAction.LoginFailed,
      actorUserId: userId,
      entityType: 'user',
      entityId: userId,
      changes: { reason: 'wrong_password', attempt: previousAttempts + 1 },
      meta,
    });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('timing-equalization-placeholder');
    return this.dummyHash;
  }

  private async deliver(message: MailMessage): Promise<void> {
    try {
      await this.mailer.send(message);
    } catch (error) {
      this.logger.error(
        `Failed to send "${message.subject}" email: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
