import { createHmac, timingSafeEqual } from 'node:crypto';

function digest(secret: string, organizationId: string, orderId: string): Buffer {
  return createHmac('sha256', secret)
    .update(`order-tracking:v1:${organizationId}:${orderId}`)
    .digest();
}

export function createTrackingToken(
  secret: string,
  organizationId: string,
  orderId: string,
): string {
  return digest(secret, organizationId, orderId).toString('base64url');
}

export function verifyTrackingToken(
  secret: string,
  organizationId: string,
  orderId: string,
  token: string,
): boolean {
  const expected = digest(secret, organizationId, orderId);
  const provided = Buffer.from(token, 'base64url');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
