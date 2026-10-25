import type { Member, Organization } from '@app/contracts';
import type {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
} from '../../generated/prisma/enums.js';

export const organizationSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  currency: true,
  timezone: true,
  contactEmail: true,
  contactPhone: true,
  primaryColor: true,
  createdAt: true,
} as const;

export interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  status: OrganizationStatus;
  currency: string;
  timezone: string;
  contactEmail: string | null;
  contactPhone: string | null;
  primaryColor: string | null;
  createdAt: Date;
}

export function toOrganization(row: OrganizationRow): Organization {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export const memberSelect = {
  id: true,
  role: true,
  status: true,
  branchId: true,
  invitedAt: true,
  acceptedAt: true,
  user: { select: { id: true, email: true, fullName: true } },
} as const;

export interface MemberRow {
  id: string;
  role: MembershipRole;
  status: MembershipStatus;
  branchId: string | null;
  invitedAt: Date;
  acceptedAt: Date | null;
  user: { id: string; email: string; fullName: string };
}

export function toMember(row: MemberRow): Member {
  return {
    membershipId: row.id,
    userId: row.user.id,
    email: row.user.email,
    fullName: row.user.fullName,
    role: row.role,
    status: row.status,
    branchId: row.branchId,
    invitedAt: row.invitedAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
  };
}
