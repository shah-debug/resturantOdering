import type { Request } from 'express';
import type { MembershipRole, PlatformRole } from '../../../generated/prisma/enums.js';
import type { Permission } from '../../access/permissions.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  emailVerifiedAt: Date | null;
  platformRole: PlatformRole | null;
}

export interface AuthContext {
  sessionId: string;
  user: AuthenticatedUser;
}

export interface OrganizationAccess {
  organizationId: string;
  membershipId: string | null;
  role: MembershipRole | null;
  branchId: string | null;
  platformRole: PlatformRole | null;
  permissions: ReadonlySet<Permission>;
}

export interface AppRequest extends Request {
  auth?: AuthContext;
  organizationAccess?: OrganizationAccess;
}

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export function requestMeta(request: Request): RequestMeta {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip ? request.ip.slice(0, 45) : null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
  };
}
