import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/errors/app.exception.js';
import type { PlatformRole } from '../../generated/prisma/enums.js';
import type { AppRequest } from '../auth/http/request-context.js';

export const PLATFORM_ROLES_KEY = 'access:platformRoles';

@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed =
      this.reflector.getAllAndOverride<PlatformRole[] | undefined>(PLATFORM_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const platformRole = context.switchToHttp().getRequest<AppRequest>().auth?.user.platformRole;
    if (!platformRole || !allowed.includes(platformRole)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Platform access required');
    }
    return true;
  }
}

export function PlatformRoute(...roles: PlatformRole[]) {
  return applyDecorators(SetMetadata(PLATFORM_ROLES_KEY, roles), UseGuards(PlatformRoleGuard));
}
