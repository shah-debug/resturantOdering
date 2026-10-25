import { Logger } from '@nestjs/common';

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

export class ResendMailer extends Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    const response = await this.fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new MailDeliveryError(`Email provider responded with HTTP ${response.status}`);
    }
  }
}
