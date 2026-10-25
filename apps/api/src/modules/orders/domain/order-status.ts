import { OrderStatus, OrderType } from '../../../generated/prisma/enums.js';

export interface OrderStatusTransition {
  from: OrderStatus;
  to: OrderStatus;
  orderType: OrderType | null;
}

export const ORDER_STATUS_TRANSITIONS: readonly OrderStatusTransition[] = [
  { from: OrderStatus.PENDING, to: OrderStatus.CONFIRMED, orderType: null },
  { from: OrderStatus.PENDING, to: OrderStatus.REJECTED, orderType: null },
  { from: OrderStatus.PENDING, to: OrderStatus.CANCELLED, orderType: null },
  { from: OrderStatus.CONFIRMED, to: OrderStatus.PREPARING, orderType: null },
  { from: OrderStatus.CONFIRMED, to: OrderStatus.CANCELLED, orderType: null },
  { from: OrderStatus.PREPARING, to: OrderStatus.READY, orderType: null },
  { from: OrderStatus.PREPARING, to: OrderStatus.CANCELLED, orderType: null },
  { from: OrderStatus.READY, to: OrderStatus.OUT_FOR_DELIVERY, orderType: OrderType.DELIVERY },
  { from: OrderStatus.READY, to: OrderStatus.COMPLETED, orderType: OrderType.PICKUP },
  { from: OrderStatus.READY, to: OrderStatus.CANCELLED, orderType: null },
  { from: OrderStatus.OUT_FOR_DELIVERY, to: OrderStatus.DELIVERED, orderType: OrderType.DELIVERY },
  {
    from: OrderStatus.OUT_FOR_DELIVERY,
    to: OrderStatus.DELIVERY_FAILED,
    orderType: OrderType.DELIVERY,
  },
  {
    from: OrderStatus.DELIVERY_FAILED,
    to: OrderStatus.OUT_FOR_DELIVERY,
    orderType: OrderType.DELIVERY,
  },
  { from: OrderStatus.DELIVERY_FAILED, to: OrderStatus.CANCELLED, orderType: OrderType.DELIVERY },
];

export const INITIAL_ORDER_STATUS = OrderStatus.PENDING;

export function canTransitionOrderStatus(
  orderType: OrderType,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ORDER_STATUS_TRANSITIONS.some(
    (transition) =>
      transition.from === from &&
      transition.to === to &&
      (transition.orderType === null || transition.orderType === orderType),
  );
}

export function nextOrderStatuses(orderType: OrderType, from: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS.filter(
    (transition) =>
      transition.from === from &&
      (transition.orderType === null || transition.orderType === orderType),
  ).map((transition) => transition.to);
}

export function isTerminalOrderStatus(orderType: OrderType, status: OrderStatus): boolean {
  return nextOrderStatuses(orderType, status).length === 0;
}
