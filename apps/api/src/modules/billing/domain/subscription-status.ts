import { SubscriptionStatus } from '../../../generated/prisma/enums.js';

export const CURRENT_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.SUSPENDED,
];

export const SUBSCRIPTION_TRANSITIONS: readonly (readonly [
  SubscriptionStatus,
  SubscriptionStatus,
])[] = [
  [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE],
  [SubscriptionStatus.TRIALING, SubscriptionStatus.CANCELED],
  [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
  [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED],
  [SubscriptionStatus.PAST_DUE, SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED],
  [SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELED],
  [SubscriptionStatus.SUSPENDED, SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.SUSPENDED, SubscriptionStatus.EXPIRED],
  [SubscriptionStatus.SUSPENDED, SubscriptionStatus.CANCELED],
];

export function canTransitionSubscription(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  return SUBSCRIPTION_TRANSITIONS.some(([source, target]) => source === from && target === to);
}

export type Standing = 'unmanaged' | 'good' | 'grace' | 'restricted';

export function standingOf(status: SubscriptionStatus | null): Standing {
  switch (status) {
    case null:
      return 'unmanaged';
    case SubscriptionStatus.TRIALING:
    case SubscriptionStatus.ACTIVE:
      return 'good';
    case SubscriptionStatus.PAST_DUE:
      return 'grace';
    default:
      return 'restricted';
  }
}
