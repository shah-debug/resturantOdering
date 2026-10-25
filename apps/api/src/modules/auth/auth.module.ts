import { Global, Module } from '@nestjs/common';
import { AuthTokenService } from './auth-token.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './crypto/password-hasher.js';
import { SessionService } from './session.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    AuthTokenService,
    { provide: PasswordHasher, useValue: new PasswordHasher() },
  ],
  exports: [SessionService, AuthTokenService],
})
export class AuthModule {}
