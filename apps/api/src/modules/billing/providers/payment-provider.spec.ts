import {
  ManualPaymentProvider,
  signWebhookPayload,
  verifyWebhookSignature,
  WebhookVerificationError,
} from './payment-provider';

const SECRET = 'whsec_test_0123456789abcdef';
const BODY = Buffer.from('{"id":"evt_1","type":"payment.succeeded"}');
const NOW = new Date('2026-11-01T10:00:00Z');
const T = Math.floor(NOW.getTime() / 1000);

describe('webhook signatures', () => {
  it('accepts a correctly signed, fresh payload', () => {
    expect(() =>
      verifyWebhookSignature({
        rawBody: BODY,
        header: signWebhookPayload(BODY, SECRET, T),
        secret: SECRET,
        now: NOW,
      }),
    ).not.toThrow();
  });

  it.each([
    ['a missing header', undefined],
    ['a malformed header', 'nonsense'],
    ['a wrong secret', signWebhookPayload(BODY, 'other-secret', T)],
    ['a stale timestamp', signWebhookPayload(BODY, SECRET, T - 301)],
    ['a future timestamp', signWebhookPayload(BODY, SECRET, T + 301)],
  ])('rejects %s', (_label, header) => {
    expect(() =>
      verifyWebhookSignature({ rawBody: BODY, header, secret: SECRET, now: NOW }),
    ).toThrow(WebhookVerificationError);
  });

  it('rejects a tampered body', () => {
    const header = signWebhookPayload(BODY, SECRET, T);
    expect(() =>
      verifyWebhookSignature({
        rawBody: Buffer.from('{"id":"evt_1","type":"payment.refunded"}'),
        header,
        secret: SECRET,
        now: NOW,
      }),
    ).toThrow(WebhookVerificationError);
  });

  it('never accepts webhooks for manual payments', () => {
    const provider = new ManualPaymentProvider();
    expect(provider.acceptsWebhooks).toBe(false);
    expect(() => provider.verifyWebhook()).toThrow(WebhookVerificationError);
  });
});
