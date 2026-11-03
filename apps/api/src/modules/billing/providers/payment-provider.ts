import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifiedProviderEvent {
  provider: string;
  eventId: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.refunded';
  invoiceId: string;
  amountMinor: number;
  currency: string;
  reference: string;
  occurredAt: Date;
}

export class WebhookVerificationError extends Error {}

export interface PaymentProvider {
  readonly id: string;
  readonly acceptsWebhooks: boolean;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    now: Date,
  ): VerifiedProviderEvent;
}

export class ManualPaymentProvider implements PaymentProvider {
  readonly id = 'manual';
  readonly acceptsWebhooks = false;

  verifyWebhook(): VerifiedProviderEvent {
    throw new WebhookVerificationError(
      'Manual payments are reported in the dashboard and verified by an administrator',
    );
  }
}

export interface SignatureCheck {
  rawBody: Buffer;
  header: string | undefined;
  secret: string;
  now: Date;
  toleranceSeconds?: number;
}

export function signWebhookPayload(rawBody: Buffer, secret: string, timestamp: number): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature({
  rawBody,
  header,
  secret,
  now,
  toleranceSeconds = 300,
}: SignatureCheck): void {
  if (!header) {
    throw new WebhookVerificationError('Missing signature header');
  }
  const parts = new Map(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key ?? '', rest.join('=')] as const;
    }),
  );
  const timestamp = Number(parts.get('t'));
  const provided = parts.get('v1') ?? '';
  if (!Number.isInteger(timestamp) || !/^[0-9a-f]{64}$/.test(provided)) {
    throw new WebhookVerificationError('Malformed signature header');
  }
  if (Math.abs(now.getTime() / 1000 - timestamp) > toleranceSeconds) {
    throw new WebhookVerificationError('Signature timestamp is outside the allowed window');
  }
  const expected = signWebhookPayload(rawBody, secret, timestamp).split('v1=')[1] ?? '';
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new WebhookVerificationError('Signature does not match');
  }
}
