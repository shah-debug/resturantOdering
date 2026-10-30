import type { OrderStatus, OrderTracking, OrderType } from '@app/contracts';

export interface ProgressStep {
  status: OrderStatus;
  label: string;
}

const DELIVERY_STEPS: ProgressStep[] = [
  { status: 'PENDING', label: 'Order placed' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'OUT_FOR_DELIVERY', label: 'On the way' },
  { status: 'DELIVERED', label: 'Delivered' },
];

const PICKUP_STEPS: ProgressStep[] = [
  { status: 'PENDING', label: 'Order placed' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'READY', label: 'Ready for pickup' },
  { status: 'COMPLETED', label: 'Picked up' },
];

const STEP_FOR_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  READY: 'PREPARING',
  DELIVERY_FAILED: 'OUT_FOR_DELIVERY',
};

export function progressSteps(type: OrderType): ProgressStep[] {
  return type === 'DELIVERY' ? DELIVERY_STEPS : PICKUP_STEPS;
}

export function currentStepIndex(type: OrderType, status: OrderStatus): number {
  const steps = progressSteps(type);
  const direct = steps.findIndex((step) => step.status === status);
  if (direct >= 0) {
    return direct;
  }
  const mapped = STEP_FOR_STATUS[status];
  return mapped ? steps.findIndex((step) => step.status === mapped) : -1;
}

export function isFinished(status: OrderStatus): boolean {
  return ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'].includes(status);
}

export function statusHeadline(order: OrderTracking): { title: string; detail: string } {
  switch (order.status) {
    case 'PENDING':
      return {
        title: 'Waiting for the restaurant to confirm',
        detail: 'The restaurant will confirm your order shortly and may call you.',
      };
    case 'CONFIRMED':
      return { title: 'Order confirmed', detail: 'The kitchen will start preparing it soon.' };
    case 'PREPARING':
      return { title: 'Your food is being prepared', detail: 'Hang tight, it’s cooking.' };
    case 'READY':
      return order.type === 'PICKUP'
        ? { title: 'Ready for pickup', detail: 'Your order is waiting for you at the counter.' }
        : { title: 'Packed and ready', detail: 'It will be on its way shortly.' };
    case 'OUT_FOR_DELIVERY':
      return { title: 'On the way', detail: 'Your rider is heading to you.' };
    case 'DELIVERY_FAILED':
      return {
        title: 'We couldn’t reach you',
        detail: 'The restaurant will try again or contact you.',
      };
    case 'DELIVERED':
      return { title: 'Delivered', detail: 'Enjoy your meal!' };
    case 'COMPLETED':
      return { title: 'Picked up', detail: 'Enjoy your meal!' };
    case 'CANCELLED':
      return { title: 'Order cancelled', detail: 'This order has been cancelled.' };
    case 'REJECTED':
      return {
        title: 'The restaurant couldn’t accept this order',
        detail: 'Please contact the restaurant or try ordering again later.',
      };
  }
}
