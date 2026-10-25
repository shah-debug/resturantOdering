import { MembershipRole, PlatformRole } from '../../generated/prisma/enums';
import { canManageRole, Permission, permissionsFor } from './permissions';

describe('permissionsFor', () => {
  it('gives owners and managers full organization permissions', () => {
    for (const role of [MembershipRole.OWNER, MembershipRole.MANAGER]) {
      const permissions = permissionsFor(role, null);
      expect(permissions.has(Permission.MembersManage)).toBe(true);
      expect(permissions.has(Permission.OrganizationUpdate)).toBe(true);
    }
  });

  it('limits order staff to orders', () => {
    const permissions = permissionsFor(MembershipRole.ORDER_STAFF, null);
    expect(permissions.has(Permission.OrdersManage)).toBe(true);
    expect(permissions.has(Permission.MembersRead)).toBe(false);
    expect(permissions.has(Permission.MenuManage)).toBe(false);
  });

  it('limits kitchen staff to reading orders and kitchen updates', () => {
    const permissions = permissionsFor(MembershipRole.KITCHEN_STAFF, null);
    expect(permissions.has(Permission.KitchenUpdate)).toBe(true);
    expect(permissions.has(Permission.OrdersManage)).toBe(false);
    expect(permissions.has(Permission.OrganizationUpdate)).toBe(false);
  });

  it('limits riders to their assigned deliveries', () => {
    expect([...permissionsFor(MembershipRole.RIDER, null)].sort()).toEqual(
      [
        Permission.OrganizationRead,
        Permission.DeliveriesReadAssigned,
        Permission.DeliveriesUpdateAssigned,
      ].sort(),
    );
  });

  it('gives platform support read-only access', () => {
    const permissions = permissionsFor(null, PlatformRole.SUPPORT);
    expect(permissions.has(Permission.OrganizationRead)).toBe(true);
    expect(permissions.has(Permission.MembersRead)).toBe(true);
    expect([...permissions].some((permission) => /manage|update/.test(permission))).toBe(false);
  });

  it('gives super admins every permission', () => {
    expect(permissionsFor(null, PlatformRole.SUPER_ADMIN).size).toBe(
      Object.values(Permission).length,
    );
  });

  it('grants nothing without a role', () => {
    expect(permissionsFor(null, null).size).toBe(0);
  });
});

describe('canManageRole', () => {
  it('lets owners assign any role', () => {
    for (const role of Object.values(MembershipRole)) {
      expect(canManageRole(MembershipRole.OWNER, null, role)).toBe(true);
    }
  });

  it('lets managers assign only staff roles', () => {
    expect(canManageRole(MembershipRole.MANAGER, null, MembershipRole.KITCHEN_STAFF)).toBe(true);
    expect(canManageRole(MembershipRole.MANAGER, null, MembershipRole.MANAGER)).toBe(false);
    expect(canManageRole(MembershipRole.MANAGER, null, MembershipRole.OWNER)).toBe(false);
  });

  it('does not let staff or support manage anyone', () => {
    expect(canManageRole(MembershipRole.ORDER_STAFF, null, MembershipRole.RIDER)).toBe(false);
    expect(canManageRole(null, PlatformRole.SUPPORT, MembershipRole.RIDER)).toBe(false);
  });

  it('lets super admins manage any role', () => {
    expect(canManageRole(null, PlatformRole.SUPER_ADMIN, MembershipRole.OWNER)).toBe(true);
  });
});
