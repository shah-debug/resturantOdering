import { createHash, randomBytes } from 'node:crypto';

export interface IssuedToken {
  token: string;
  tokenHash: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function issueToken(): IssuedToken {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}
