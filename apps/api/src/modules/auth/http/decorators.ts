import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
} from '@nestjs/common';
import type { AppRequest, AuthContext, OrganizationAccess } from './request-context.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const SENSITIVE_RATE_LIMIT_KEY = 'auth:sensitiveRateLimit';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SensitiveRateLimit = () => SetMetadata(SENSITIVE_RATE_LIMIT_KEY, true);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<AppRequest>().auth;
    if (!auth) {
      throw new InternalServerErrorException('CurrentAuth used on a route without authentication');
    }
    return auth;
  },
);

export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrganizationAccess => {
    const access = context.switchToHttp().getRequest<AppRequest>().organizationAccess;
    if (!access) {
      throw new InternalServerErrorException(
        'CurrentOrganization used on a route without OrganizationAccessGuard',
      );
    }
    return access;
  },
);
