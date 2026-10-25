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
import { PrismaService } from '../../database/prisma.service.js';
import { MembershipStatus, OrganizationStatus } from '../../generated/prisma/enums.js';
import type { AppRequest } from '../auth/http/request-context.js';
import { type Permission, permissionsFor } from './permissions.js';

export const REQUIRED_PERMISSIONS_KEY = 'access:requiredPermissions';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function organizationNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Organization not found');
}

@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const auth = request.auth;
    if (!auth) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Sign in to continue');
    }

    const param = request.params.organizationId;
    const organizationId = typeof param === 'string' ? param : undefined;
    if (!organizationId || !UUID_PATTERN.test(organizationId)) {
      throw organizationNotFound();
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        status: true,
        memberships: {
          where: { userId: auth.user.id },
          select: { id: true, role: true, status: true, branchId: true },
        },
      },
    });
    const membership = organization?.memberships[0];
    const activeMembership = membership?.status === MembershipStatus.ACTIVE ? membership : null;
    const platformRole = auth.user.platformRole;

    if (!organization || (!activeMembership && !platformRole)) {
      throw organizationNotFound();
    }
    if (organization.status !== OrganizationStatus.ACTIVE && !platformRole) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'This organization is not active');
    }

    const permissions = permissionsFor(activeMembership?.role ?? null, platformRole);
    const required =
      this.reflector.getAllAndOverride<Permission[] | undefined>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (!required.every((permission) => permissions.has(permission))) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'You do not have permission to do this',
      );
    }

    request.organizationAccess = {
      organizationId,
      membershipId: activeMembership?.id ?? null,
      role: activeMembership?.role ?? null,
      branchId: activeMembership?.branchId ?? null,
      platformRole,
      permissions,
    };
    return true;
  }
}

export function OrganizationRoute(...permissions: Permission[]) {
  return applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions),
    UseGuards(OrganizationAccessGuard),
  );
}
