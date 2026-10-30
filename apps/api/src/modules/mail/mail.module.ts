import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { createSmtpTransport, LogMailer, Mailer, SmtpMailer } from './mailer.js';

@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Mailer => {
        const { from, smtp } = config.mail;
        if (smtp) {
          return new SmtpMailer(createSmtpTransport(smtp), from);
        }
        return new LogMailer();
      },
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
