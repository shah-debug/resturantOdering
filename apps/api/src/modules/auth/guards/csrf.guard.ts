import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../../../common/errors/app.exception.js';
import { AppConfig } from '../../../config/app-config.js';
import { isTrustedRequestOrigin } from '../http/csrf.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const trusted = isTrustedRequestOrigin(
      request.method,
      { origin: request.headers.origin, referer: request.headers.referer },
      this.config.appOrigins,
    );
    if (!trusted) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'CSRF_REJECTED',
        'Request origin is not allowed',
      );
    }
    return true;
  }
}
