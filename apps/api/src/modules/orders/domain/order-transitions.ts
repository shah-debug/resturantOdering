import { Permission } from '../../access/permissions.js';
import { OrderStatus, type OrderType } from '../../../generated/prisma/enums.js';
import { nextOrderStatuses } from './order-status.js';

export const TRANSITION_PERMISSIONS: Readonly<Record<OrderStatus, readonly Permission[]>> = {
  [OrderStatus.PENDING]: [],
  [OrderStatus.CONFIRMED]: [Permission.OrdersManage],
  [OrderStatus.REJECTED]: [Permission.OrdersManage],
  [OrderStatus.PREPARING]: [Permission.OrdersManage, Permission.KitchenUpdate],
  [OrderStatus.READY]: [Permission.OrdersManage, Permission.KitchenUpdate],
  [OrderStatus.OUT_FOR_DELIVERY]: [Permission.OrdersManage],
  [OrderStatus.DELIVERY_FAILED]: [Permission.OrdersManage],
  [OrderStatus.DELIVERED]: [Permission.OrdersManage],
  [OrderStatus.COMPLETED]: [Permission.OrdersManage],
  [OrderStatus.CANCELLED]: [Permission.OrdersManage],
};

export const RIDER_ASSIGNABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.DELIVERY_FAILED,
];

export interface TransitionSubject {
  type: OrderType;
  status: OrderStatus;
  riderId: string | null;
}

export function canPerformTransition(
  permissions: ReadonlySet<Permission>,
  to: OrderStatus,
): boolean {
  return TRANSITION_PERMISSIONS[to].some((permission) => permissions.has(permission));
}

export function availableTransitions(
  order: TransitionSubject,
  permissions: ReadonlySet<Permission>,
): OrderStatus[] {
  return nextOrderStatuses(order.type, order.status).filter(
    (to) =>
      canPerformTransition(permissions, to) &&
      (to !== OrderStatus.OUT_FOR_DELIVERY || order.riderId !== null),
  );
}

export function canAssignRider(
  order: TransitionSubject,
  permissions: ReadonlySet<Permission>,
): boolean {
  return (
    order.type === 'DELIVERY' &&
    permissions.has(Permission.OrdersManage) &&
    RIDER_ASSIGNABLE_STATUSES.includes(order.status)
  );
}
