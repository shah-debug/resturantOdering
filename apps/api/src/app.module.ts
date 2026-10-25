import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CsrfGuard } from './modules/auth/guards/csrf.guard.js';
import { SessionAuthGuard } from './modules/auth/guards/session-auth.guard.js';
import { SENSITIVE_RATE_LIMIT_KEY } from './modules/auth/http/decorators.js';
import { HealthModule } from './modules/health/health.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { BranchesModule } from './modules/branches/branches.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        errorMessage: 'Too many requests. Please try again shortly.',
        throttlers: [
          { name: 'default', ttl: config.rateLimit.windowMs, limit: config.rateLimit.maxRequests },
          {
            name: 'sensitive',
            ttl: config.rateLimit.sensitiveWindowMs,
            limit: config.rateLimit.sensitiveMaxRequests,
            skipIf: (context) =>
              Reflect.getMetadata(SENSITIVE_RATE_LIMIT_KEY, context.getHandler()) !== true,
          },
        ],
      }),
    }),
    AuditModule,
    MailModule,
    AuthModule,
    HealthModule,
    OrganizationsModule,
    BranchesModule,
    OnboardingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
