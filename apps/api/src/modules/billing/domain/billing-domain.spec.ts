import { SubscriptionStatus } from '../../../generated/prisma/enums';
import { reminderThreshold } from '../billing-lifecycle.service';
import {
  addLocalDaysTo,
  anchorDayOf,
  billingPeriod,
  nextAnchorDate,
  wholeLocalDaysBetween,
} from './billing-calendar';
import { canTransitionSubscription, standingOf } from './subscription-status';

describe('billing calendar', () => {
  it('renews on the same local calendar day each month', () => {
    expect(nextAnchorDate('2026-11-15', 15, 'MONTHLY')).toBe('2026-12-15');
    expect(nextAnchorDate('2026-12-15', 15, 'MONTHLY')).toBe('2027-01-15');
    expect(nextAnchorDate('2026-11-15', 15, 'YEARLY')).toBe('2027-11-15');
  });

  it('clamps to the end of short months and returns to the anchor day afterwards', () => {
    expect(nextAnchorDate('2027-01-31', 31, 'MONTHLY')).toBe('2027-02-28');
    expect(nextAnchorDate('2027-02-28', 31, 'MONTHLY')).toBe('2027-03-31');
    expect(nextAnchorDate('2028-01-31', 31, 'MONTHLY')).toBe('2028-02-29');
    expect(nextAnchorDate('2028-02-29', 29, 'YEARLY')).toBe('2029-02-28');
    expect(anchorDayOf('2027-01-31')).toBe(31);
  });

  it('starts and ends periods at local midnight in the restaurant time zone', () => {
    const period = billingPeriod('2026-11-01', 1, 'MONTHLY', 'Asia/Karachi');
    expect(period.start.toISOString()).toBe('2026-10-31T19:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-11-30T19:00:00.000Z');
    expect(period.endDate).toBe('2026-12-01');
  });

  it('counts grace and reminder days in local days', () => {
    const lateEvening = new Date('2026-11-01T18:30:00Z');
    expect(addLocalDaysTo(lateEvening, 7, 'Asia/Karachi').toISOString()).toBe(
      '2026-11-07T19:00:00.000Z',
    );
    expect(
      wholeLocalDaysBetween(
        new Date('2026-11-01T18:59:00Z'),
        new Date('2026-11-01T19:01:00Z'),
        'Asia/Karachi',
      ),
    ).toBe(1);
  });
});

describe('subscription states', () => {
  it('allows only the documented transitions', () => {
    expect(canTransitionSubscription(SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE)).toBe(
      true,
    );
    expect(
      canTransitionSubscription(SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED),
    ).toBe(true);
    expect(canTransitionSubscription(SubscriptionStatus.SUSPENDED, SubscriptionStatus.ACTIVE)).toBe(
      true,
    );
    expect(canTransitionSubscription(SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED)).toBe(
      false,
    );
    expect(canTransitionSubscription(SubscriptionStatus.EXPIRED, SubscriptionStatus.ACTIVE)).toBe(
      false,
    );
    expect(canTransitionSubscription(SubscriptionStatus.CANCELED, SubscriptionStatus.ACTIVE)).toBe(
      false,
    );
    expect(canTransitionSubscription(SubscriptionStatus.TRIALING, SubscriptionStatus.EXPIRED)).toBe(
      false,
    );
  });

  it('maps states to service standing', () => {
    expect(standingOf(null)).toBe('unmanaged');
    expect(standingOf(SubscriptionStatus.TRIALING)).toBe('good');
    expect(standingOf(SubscriptionStatus.PAST_DUE)).toBe('grace');
    for (const status of [
      SubscriptionStatus.SUSPENDED,
      SubscriptionStatus.CANCELED,
      SubscriptionStatus.EXPIRED,
    ]) {
      expect(standingOf(status)).toBe('restricted');
    }
  });
});

describe('renewal reminders', () => {
  it('uses the closest threshold so each reminder is sent once', () => {
    expect([10, 7, 6, 3, 2, 1, 0, -1].map(reminderThreshold)).toEqual([
      null,
      7,
      7,
      3,
      3,
      1,
      null,
      null,
    ]);
  });
});
