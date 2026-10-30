import { MembershipRole, OrderStatus, OrderType } from '../../../generated/prisma/enums';
import { permissionsFor } from '../../access/permissions';
import { retryDelaySeconds } from '../../notifications/notification-dispatcher.service';
import { availableTransitions, canAssignRider } from './order-transitions';

const staff = permissionsFor(MembershipRole.ORDER_STAFF, null);
const kitchen = permissionsFor(MembershipRole.KITCHEN_STAFF, null);
const rider = permissionsFor(MembershipRole.RIDER, null);

function order(
  status: OrderStatus,
  type: OrderType = OrderType.DELIVERY,
  riderId: string | null = null,
) {
  return { status, type, riderId };
}

describe('order transitions by role', () => {
  it('lets order staff accept, reject or cancel new orders', () => {
    expect(availableTransitions(order(OrderStatus.PENDING), staff)).toEqual([
      OrderStatus.CONFIRMED,
      OrderStatus.REJECTED,
      OrderStatus.CANCELLED,
    ]);
  });

  it('limits the kitchen to cooking steps', () => {
    expect(availableTransitions(order(OrderStatus.PENDING), kitchen)).toEqual([]);
    expect(availableTransitions(order(OrderStatus.CONFIRMED), kitchen)).toEqual([
      OrderStatus.PREPARING,
    ]);
    expect(availableTransitions(order(OrderStatus.PREPARING), kitchen)).toEqual([
      OrderStatus.READY,
    ]);
    expect(availableTransitions(order(OrderStatus.READY), kitchen)).toEqual([]);
  });

  it('gives riders no dashboard transitions', () => {
    expect(availableTransitions(order(OrderStatus.READY, OrderType.DELIVERY, 'r'), rider)).toEqual(
      [],
    );
  });

  it('only offers dispatch once a rider is assigned', () => {
    expect(availableTransitions(order(OrderStatus.READY), staff)).toEqual([OrderStatus.CANCELLED]);
    expect(availableTransitions(order(OrderStatus.READY, OrderType.DELIVERY, 'r'), staff)).toEqual([
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.CANCELLED,
    ]);
    expect(availableTransitions(order(OrderStatus.READY, OrderType.PICKUP), staff)).toEqual([
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
    ]);
  });

  it('ends at terminal statuses', () => {
    for (const status of [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.REJECTED]) {
      expect(availableTransitions(order(status), staff)).toEqual([]);
    }
  });

  it('allows rider changes only before dispatch or after a failed delivery', () => {
    expect(canAssignRider(order(OrderStatus.PENDING), staff)).toBe(false);
    expect(canAssignRider(order(OrderStatus.READY), staff)).toBe(true);
    expect(canAssignRider(order(OrderStatus.OUT_FOR_DELIVERY), staff)).toBe(false);
    expect(canAssignRider(order(OrderStatus.DELIVERY_FAILED), staff)).toBe(true);
    expect(canAssignRider(order(OrderStatus.READY, OrderType.PICKUP), staff)).toBe(false);
    expect(canAssignRider(order(OrderStatus.READY), kitchen)).toBe(false);
  });
});

describe('notification retry backoff', () => {
  it('doubles the wait after each attempt', () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([30, 60, 120, 240]);
  });
});
