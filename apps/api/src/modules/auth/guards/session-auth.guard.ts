import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import { AppConfig } from '../../../config/app-config.js';
import { parseCookieHeader } from '../http/cookies.js';
import { IS_PUBLIC_KEY } from '../http/decorators.js';
import type { AppRequest } from '../http/request-context.js';
import { SessionService } from '../session.service.js';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = parseCookieHeader(request.headers.cookie).get(this.config.auth.sessionCookieName);
    const auth = token ? await this.sessions.authenticate(token) : null;
    if (!auth) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Sign in to continue');
    }
    request.auth = auth;
    return true;
  }
}
