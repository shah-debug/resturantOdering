import { orderTrackingTokenSchema } from '@app/contracts';
import { createTrackingToken, verifyTrackingToken } from './tracking-token';

const SECRET = 'test-order-tracking-secret-0123456789abcdef';
const ORG = '018f0000-0000-7000-8000-000000000001';
const ORDER = '018f0000-0000-7000-8000-000000000002';

describe('order tracking tokens', () => {
  it('creates a URL-safe token that verifies for the same order', () => {
    const token = createTrackingToken(SECRET, ORG, ORDER);
    expect(orderTrackingTokenSchema.safeParse(token).success).toBe(true);
    expect(verifyTrackingToken(SECRET, ORG, ORDER, token)).toBe(true);
  });

  it('rejects tokens for another order, organization or secret', () => {
    const token = createTrackingToken(SECRET, ORG, ORDER);
    expect(verifyTrackingToken(SECRET, ORG, ORG, token)).toBe(false);
    expect(verifyTrackingToken(SECRET, ORDER, ORDER, token)).toBe(false);
    expect(verifyTrackingToken(`${SECRET}-rotated`, ORG, ORDER, token)).toBe(false);
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifyTrackingToken(SECRET, ORG, ORDER, '')).toBe(false);
    expect(verifyTrackingToken(SECRET, ORG, ORDER, 'short')).toBe(false);
  });
});
