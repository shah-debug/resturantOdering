import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

export class LogMailer extends Mailer {
  private readonly logger = new Logger('LogMailer');

  send(message: MailMessage): Promise<void> {
    this.logger.log(`Email to ${message.to}: ${message.subject}\n${message.text}`);
    return Promise.resolve();
  }
}

export class MailDeliveryError extends Error {}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string | undefined;
  password: string | undefined;
}

export interface MailTransport {
  sendMail(mail: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

export function createSmtpTransport(settings: SmtpSettings): MailTransport {
  return createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: settings.requireTls,
    auth:
      settings.user && settings.password
        ? { user: settings.user, pass: settings.password }
        : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export class SmtpMailer extends Mailer {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'UNKNOWN';
      throw new MailDeliveryError(`SMTP delivery failed (${code})`);
    }
  }
}
