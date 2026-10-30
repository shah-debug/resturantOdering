import type { BadgeVariant } from '@app/web/ui';
import type { OrderStatus } from '@app/contracts';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'New',
  CONFIRMED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERY_FAILED: 'Delivery failed',
  DELIVERED: 'Delivered',
  COMPLETED: 'Picked up',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

export const TRANSITION_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Reopen',
  CONFIRMED: 'Accept',
  PREPARING: 'Start preparing',
  READY: 'Mark ready',
  OUT_FOR_DELIVERY: 'Send out for delivery',
  DELIVERY_FAILED: 'Delivery failed',
  DELIVERED: 'Mark delivered',
  COMPLETED: 'Mark picked up',
  CANCELLED: 'Cancel order',
  REJECTED: 'Reject',
};

export const REASON_PROMPTS: Partial<Record<OrderStatus, string>> = {
  REJECTED: 'Why are you rejecting this order?',
  CANCELLED: 'Why is this order being cancelled?',
  DELIVERY_FAILED: 'What went wrong with the delivery?',
};

const DESTRUCTIVE: readonly OrderStatus[] = ['REJECTED', 'CANCELLED', 'DELIVERY_FAILED'];

export function isDestructiveTransition(status: OrderStatus): boolean {
  return DESTRUCTIVE.includes(status);
}

export function statusVariant(status: OrderStatus): BadgeVariant {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'DELIVERED':
    case 'COMPLETED':
      return 'success';
    case 'CANCELLED':
    case 'REJECTED':
    case 'DELIVERY_FAILED':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function formatAge(iso: string, now: number): string {
  const minutes = minutesSince(iso, now);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min ago` : `${Math.floor(hours / 24)} d ago`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PK', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));
}
