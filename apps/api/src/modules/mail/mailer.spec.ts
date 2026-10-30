import { vi } from 'vitest';
import { AppConfig } from '../../config/app-config';
import { parseEnv } from '../../config/env';
import { MailDeliveryError, SmtpMailer, type MailTransport } from './mailer';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/app';

describe('SmtpMailer', () => {
  const message = { to: 'owner@example.com', subject: 'Verify', text: 'Link' };

  it('sends the message through the SMTP transport with the configured sender', async () => {
    const sendMail = vi.fn<MailTransport['sendMail']>(() => Promise.resolve({}));
    await new SmtpMailer({ sendMail }, 'Platform <no-reply@example.com>').send(message);

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Platform <no-reply@example.com>',
      to: 'owner@example.com',
      subject: 'Verify',
      text: 'Link',
    });
  });

  it('throws without leaking the server response when delivery fails', async () => {
    const failure = Object.assign(new Error('535 Authentication failed for secret-user'), {
      code: 'EAUTH',
    });
    const sending = new SmtpMailer(
      { sendMail: () => Promise.reject(failure) },
      'a@example.com',
    ).send(message);
    await expect(sending).rejects.toBeInstanceOf(MailDeliveryError);
    await expect(sending).rejects.toThrow('SMTP delivery failed (EAUTH)');
    await expect(sending).rejects.not.toThrow(/secret-user/);
  });
});

describe('mail config', () => {
  it('uses implicit TLS on port 465 unless overridden', () => {
    const config = (env: Record<string, string>) =>
      new AppConfig(
        parseEnv({ DATABASE_URL, MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.com', ...env }),
      ).mail.smtp;

    expect(config({ SMTP_PORT: '465' })).toMatchObject({ port: 465, secure: true });
    expect(config({})).toMatchObject({ port: 587, secure: false, requireTls: false });
    expect(config({ SMTP_PORT: '465', SMTP_SECURE: 'false' })).toMatchObject({ secure: false });
  });

  it('requires STARTTLS in production', () => {
    const config = new AppConfig(
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL,
        DATABASE_SSL_CA_PATH: '/ca.crt',
        APP_ORIGINS: 'https://app.example.com',
        MAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.example.com',
        STORAGE_DRIVER: 'supabase',
        SUPABASE_URL: 'https://abc.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value-123',
        ORDER_TRACKING_SECRET: 'test-order-tracking-secret-0123456789abcdef',
      }),
    );
    expect(config.mail.smtp?.requireTls).toBe(true);
  });

  it('has no SMTP settings for the log transport', () => {
    expect(new AppConfig(parseEnv({ DATABASE_URL })).mail.smtp).toBeUndefined();
  });
});
