import type { SubscriptionState, SubscriptionStatus } from '@app/contracts';

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: 'Free trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Payment overdue',
  SUSPENDED: 'Suspended',
  CANCELED: 'Cancelled',
  EXPIRED: 'Expired',
};

export function formatBillingDate(iso: string | null, timeZone: string): string {
  return iso
    ? new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeZone }).format(new Date(iso))
    : '';
}

export function daysUntil(iso: string | null, now: number): number | null {
  return iso ? Math.ceil((new Date(iso).getTime() - now) / 86_400_000) : null;
}

export interface BillingNotice {
  tone: 'info' | 'warning' | 'danger';
  title: string;
  detail: string;
}

export function billingNotice(state: SubscriptionState, now: number): BillingNotice | null {
  const date = (iso: string | null) => formatBillingDate(iso, state.timezone);
  if (state.standing === 'restricted') {
    return {
      tone: 'danger',
      title: 'Online ordering is paused',
      detail:
        state.status === 'SUSPENDED'
          ? 'The subscription is suspended because payment was not verified in time. Your menu, orders and other data are kept. Ordering resumes as soon as a payment is verified.'
          : 'There is no active subscription. Your data is kept, but customers cannot order online and you cannot add new items.',
    };
  }
  if (state.standing === 'grace') {
    return {
      tone: 'warning',
      title: 'Payment overdue',
      detail: `Online ordering pauses on ${date(state.graceEndsAt)} unless a payment is verified before then.`,
    };
  }
  if (state.status === 'TRIALING') {
    const left = daysUntil(state.trialEndsAt, now);
    if (left !== null && left <= 7) {
      return {
        tone: 'info',
        title: `Your free trial ends on ${date(state.trialEndsAt)}`,
        detail: 'Record your payment on the Billing page to keep online ordering running.',
      };
    }
  }
  if (state.cancelAtPeriodEnd && state.currentPeriodEnd) {
    return {
      tone: 'warning',
      title: `Subscription ends on ${date(state.currentPeriodEnd)}`,
      detail: 'Online ordering will pause after this date. Your data will be kept.',
    };
  }
  return null;
}
