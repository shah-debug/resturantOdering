import { vi } from 'vitest';
import { MailDeliveryError, ResendMailer } from './mailer';

describe('ResendMailer', () => {
  const message = { to: 'owner@example.com', subject: 'Verify', text: 'Link' };

  it('posts the message to the Resend API with the API key', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 200 })));
    await new ResendMailer('re_key', 'Platform <no-reply@example.com>', fetchFn).send(message);

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer re_key');
    expect(typeof init?.body === 'string' ? JSON.parse(init.body) : null).toEqual({
      from: 'Platform <no-reply@example.com>',
      to: ['owner@example.com'],
      subject: 'Verify',
      text: 'Link',
    });
  });

  it('throws without leaking the response body when delivery fails', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{"message":"invalid key re_key"}', { status: 401 })),
    );
    const sending = new ResendMailer('re_key', 'a@example.com', fetchFn).send(message);
    await expect(sending).rejects.toBeInstanceOf(MailDeliveryError);
    await expect(sending).rejects.not.toThrow(/re_key/);
  });
});
