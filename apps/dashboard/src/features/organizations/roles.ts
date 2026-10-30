import { MEMBERSHIP_ROLES, type MembershipRole, type MembershipStatus } from '@app/contracts';

export const ROLE_LABELS: Record<MembershipRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  ORDER_STAFF: 'Order staff',
  KITCHEN_STAFF: 'Kitchen staff',
  RIDER: 'Rider',
};

export const STATUS_LABELS: Record<MembershipStatus, string> = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
};

const MANAGER_ASSIGNABLE_ROLES: readonly MembershipRole[] = [
  'ORDER_STAFF',
  'KITCHEN_STAFF',
  'RIDER',
];

export function assignableRoles(role: MembershipRole | undefined): readonly MembershipRole[] {
  if (role === 'OWNER') {
    return MEMBERSHIP_ROLES;
  }
  if (role === 'MANAGER') {
    return MANAGER_ASSIGNABLE_ROLES;
  }
  return [];
}

export function suggestSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 63)
    .replace(/-+$/, '');
}

export function canManageRestaurant(role: MembershipRole | undefined): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function canManageTeam(role: MembershipRole | undefined): boolean {
  return assignableRoles(role).length > 0;
}

const MENU_READERS: readonly MembershipRole[] = [
  'OWNER',
  'MANAGER',
  'ORDER_STAFF',
  'KITCHEN_STAFF',
];

export function canReadMenu(role: MembershipRole | undefined): boolean {
  return role !== undefined && MENU_READERS.includes(role);
}

export function canManageMenu(role: MembershipRole | undefined): boolean {
  return canManageRestaurant(role);
}

const ORDER_READERS: readonly MembershipRole[] = [
  'OWNER',
  'MANAGER',
  'ORDER_STAFF',
  'KITCHEN_STAFF',
];

export function canReadOrders(role: MembershipRole | undefined): boolean {
  return role !== undefined && ORDER_READERS.includes(role);
}

const RIDER_READERS: readonly MembershipRole[] = ['OWNER', 'MANAGER', 'ORDER_STAFF'];

export function canReadRiders(role: MembershipRole | undefined): boolean {
  return role !== undefined && RIDER_READERS.includes(role);
}

export function canReadReports(role: MembershipRole | undefined): boolean {
  return canManageRestaurant(role);
}
