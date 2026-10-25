import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { LogMailer, Mailer, ResendMailer } from './mailer.js';

@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Mailer => {
        const { transport, from, resendApiKey } = config.mail;
        if (transport === 'resend' && resendApiKey) {
          return new ResendMailer(resendApiKey, from);
        }
        return new LogMailer();
      },
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
