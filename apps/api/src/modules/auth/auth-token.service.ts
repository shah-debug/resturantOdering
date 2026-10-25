import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuthTokenPurpose } from '../../generated/prisma/enums.js';
import { hashToken, issueToken } from './crypto/secure-token.js';

const HOUR_MS = 60 * 60 * 1000;

export const AUTH_TOKEN_TTL_MS: Readonly<Record<AuthTokenPurpose, number>> = {
  [AuthTokenPurpose.EMAIL_VERIFICATION]: 24 * HOUR_MS,
  [AuthTokenPurpose.PASSWORD_RESET]: HOUR_MS,
  [AuthTokenPurpose.INVITATION]: 7 * 24 * HOUR_MS,
};

type TokenClient = Pick<Prisma.TransactionClient, 'authToken'>;

export interface ConsumedToken {
  userId: string;
  membershipId: string | null;
}

@Injectable()
export class AuthTokenService {
  async issue(
    client: TokenClient,
    userId: string,
    purpose: AuthTokenPurpose,
    membershipId: string | null = null,
  ): Promise<string> {
    const now = new Date();
    await client.authToken.updateMany({
      where: { userId, purpose, membershipId, consumedAt: null },
      data: { consumedAt: now },
    });
    const { token, tokenHash } = issueToken();
    await client.authToken.create({
      data: {
        userId,
        purpose,
        membershipId,
        tokenHash,
        expiresAt: new Date(now.getTime() + AUTH_TOKEN_TTL_MS[purpose]),
      },
    });
    return token;
  }

  async consume(
    client: TokenClient,
    token: string,
    purpose: AuthTokenPurpose,
  ): Promise<ConsumedToken | null> {
    const now = new Date();
    const tokenHash = hashToken(token);
    const claimed = await client.authToken.updateMany({
      where: { tokenHash, purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) {
      return null;
    }
    const record = await client.authToken.findUnique({
      where: { tokenHash },
      select: { userId: true, membershipId: true },
    });
    return record;
  }
}
