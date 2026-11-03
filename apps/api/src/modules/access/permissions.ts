import { MembershipRole, PlatformRole } from '../../generated/prisma/enums.js';

export const Permission = {
  OrganizationRead: 'organization:read',
  OrganizationUpdate: 'organization:update',
  MembersRead: 'members:read',
  MembersManage: 'members:manage',
  BranchesRead: 'branches:read',
  BranchesManage: 'branches:manage',
  MenuRead: 'menu:read',
  MenuManage: 'menu:manage',
  OrdersRead: 'orders:read',
  OrdersManage: 'orders:manage',
  KitchenUpdate: 'kitchen:update',
  RidersRead: 'riders:read',
  RidersManage: 'riders:manage',
  ReportsRead: 'reports:read',
  BillingRead: 'billing:read',
  BillingManage: 'billing:manage',
  DeliveriesReadAssigned: 'deliveries:read-assigned',
  DeliveriesUpdateAssigned: 'deliveries:update-assigned',
  AuditRead: 'audit:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

export const ROLE_PERMISSIONS: Readonly<Record<MembershipRole, readonly Permission[]>> = {
  [MembershipRole.OWNER]: ALL_PERMISSIONS,
  [MembershipRole.MANAGER]: ALL_PERMISSIONS.filter(
    (permission) => permission !== Permission.BillingManage,
  ),
  [MembershipRole.ORDER_STAFF]: [
    Permission.OrganizationRead,
    Permission.BranchesRead,
    Permission.MenuRead,
    Permission.OrdersRead,
    Permission.OrdersManage,
    Permission.RidersRead,
  ],
  [MembershipRole.KITCHEN_STAFF]: [
    Permission.OrganizationRead,
    Permission.BranchesRead,
    Permission.MenuRead,
    Permission.OrdersRead,
    Permission.KitchenUpdate,
  ],
  [MembershipRole.RIDER]: [
    Permission.OrganizationRead,
    Permission.DeliveriesReadAssigned,
    Permission.DeliveriesUpdateAssigned,
  ],
};

export const PLATFORM_ROLE_PERMISSIONS: Readonly<Record<PlatformRole, readonly Permission[]>> = {
  [PlatformRole.SUPER_ADMIN]: ALL_PERMISSIONS,
  [PlatformRole.SUPPORT]: [
    Permission.OrganizationRead,
    Permission.MembersRead,
    Permission.BranchesRead,
    Permission.MenuRead,
    Permission.OrdersRead,
    Permission.RidersRead,
    Permission.ReportsRead,
    Permission.BillingRead,
    Permission.AuditRead,
  ],
};

export const ORGANIZATION_WIDE_PERMISSIONS: readonly Permission[] = [
  Permission.OrganizationUpdate,
  Permission.MenuManage,
  Permission.BillingRead,
  Permission.BillingManage,
];

export function permissionsFor(
  role: MembershipRole | null,
  platformRole: PlatformRole | null,
  branchId: string | null = null,
): ReadonlySet<Permission> {
  const branchScoped = branchId !== null && role !== MembershipRole.OWNER;
  const fromRole = role
    ? ROLE_PERMISSIONS[role].filter(
        (permission) => !(branchScoped && ORGANIZATION_WIDE_PERMISSIONS.includes(permission)),
      )
    : [];
  return new Set([...fromRole, ...(platformRole ? PLATFORM_ROLE_PERMISSIONS[platformRole] : [])]);
}

const ASSIGNABLE_ROLES: Readonly<Record<MembershipRole, readonly MembershipRole[]>> = {
  [MembershipRole.OWNER]: Object.values(MembershipRole),
  [MembershipRole.MANAGER]: [
    MembershipRole.ORDER_STAFF,
    MembershipRole.KITCHEN_STAFF,
    MembershipRole.RIDER,
  ],
  [MembershipRole.ORDER_STAFF]: [],
  [MembershipRole.KITCHEN_STAFF]: [],
  [MembershipRole.RIDER]: [],
};

export function canManageRole(
  actorRole: MembershipRole | null,
  actorPlatformRole: PlatformRole | null,
  targetRole: MembershipRole,
): boolean {
  if (actorPlatformRole === PlatformRole.SUPER_ADMIN) {
    return true;
  }
  return actorRole !== null && ASSIGNABLE_ROLES[actorRole].includes(targetRole);
}
