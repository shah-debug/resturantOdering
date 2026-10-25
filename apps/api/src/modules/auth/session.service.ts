import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { UserStatus } from '../../generated/prisma/enums.js';
import { hashToken, issueToken } from './crypto/secure-token.js';
import type { AuthContext, RequestMeta } from './http/request-context.js';

const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export const SessionRevocationReason = {
  Logout: 'logout',
  LogoutAll: 'logout_all',
  PasswordReset: 'password_reset',
  PasswordChanged: 'password_changed',
} as const;

export type SessionRevocationReason =
  (typeof SessionRevocationReason)[keyof typeof SessionRevocationReason];

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

type SessionWriter = Pick<Prisma.TransactionClient, 'session'>;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async create(
    userId: string,
    meta: RequestMeta,
    client: SessionWriter = this.prisma,
  ): Promise<CreatedSession> {
    const { token, tokenHash } = issueToken();
    const expiresAt = new Date(Date.now() + this.config.auth.sessionTtlMs);
    const session = await client.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      select: { id: true },
    });
    return { token, sessionId: session.id, expiresAt };
  }

  async authenticate(token: string): Promise<AuthContext | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        revokedAt: true,
        expiresAt: true,
        lastSeenAt: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            status: true,
            emailVerifiedAt: true,
            platformRole: true,
          },
        },
      },
    });
    const now = Date.now();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now ||
      now - session.lastSeenAt.getTime() > this.config.auth.sessionIdleTimeoutMs ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      return null;
    }
    if (now - session.lastSeenAt.getTime() > LAST_SEEN_UPDATE_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }
    const { status: _status, ...user } = session.user;
    return { sessionId: session.id, user };
  }

  async revoke(sessionId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevocationReason,
    options: { exceptSessionId?: string; client?: SessionWriter } = {},
  ): Promise<number> {
    const result = await (options.client ?? this.prisma).session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }
}
