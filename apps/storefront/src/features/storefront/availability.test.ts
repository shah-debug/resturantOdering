import { getOpenStatus, minuteOfWeek } from '@app/contracts';
import { branch, karachiTime, storefrontFixture } from '@/testing/storefront-fixture';
import { formatClockTime, getStoreAvailability } from './availability';

const LATE_NIGHT = [
  { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' },
  { dayOfWeek: 7, opensAt: '12:00', closesAt: '16:00' },
];

describe('minuteOfWeek', () => {
  it('uses the restaurant time zone, not the server clock', () => {
    const instant = new Date('2026-11-01T20:30:00Z');
    expect(minuteOfWeek(instant, 'Asia/Karachi')).toBe(90);
    expect(minuteOfWeek(instant, 'UTC')).toBe(6 * 1440 + 20 * 60 + 30);
  });
});

describe('getOpenStatus', () => {
  it('is open inside an interval and reports when it closes', () => {
    const status = getOpenStatus(LATE_NIGHT, 'Asia/Karachi', karachiTime('2026-10-30T19:00:00'));
    expect(status).toMatchObject({
      isOpen: true,
      closesAt: { dayOfWeek: 6, time: '02:00', inMinutes: 420 },
    });
  });

  it('stays open past midnight for overnight hours', () => {
    const status = getOpenStatus(LATE_NIGHT, 'Asia/Karachi', karachiTime('2026-10-31T01:30:00'));
    expect(status.isOpen).toBe(true);
  });

  it('wraps from Sunday to Monday when finding the next opening', () => {
    const status = getOpenStatus(
      [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' }],
      'Asia/Karachi',
      karachiTime('2026-11-01T20:00:00'),
    );
    expect(status).toMatchObject({
      isOpen: false,
      nextOpening: { dayOfWeek: 1, time: '09:00', inMinutes: 13 * 60 },
    });
  });

  it('has no next opening without hours', () => {
    expect(getOpenStatus([], 'Asia/Karachi', new Date())).toEqual({
      isOpen: false,
      closesAt: null,
      nextOpening: null,
    });
  });
});

describe('getStoreAvailability', () => {
  it('is open during opening hours', () => {
    expect(getStoreAvailability(storefrontFixture(), karachiTime('2026-10-30T13:00:00'))).toEqual({
      state: 'open',
      label: 'Open now',
      detail: 'Closes today at 11:00 pm',
    });
  });

  it('explains when a closed restaurant opens next', () => {
    expect(
      getStoreAvailability(storefrontFixture(), karachiTime('2026-10-30T09:00:00')),
    ).toMatchObject({ state: 'closed', detail: 'Opens today at 12:00 pm' });
    expect(
      getStoreAvailability(storefrontFixture(), karachiTime('2026-10-30T23:30:00')),
    ).toMatchObject({ state: 'closed', detail: 'Opens tomorrow at 12:00 pm' });

    const mondaysOnly = storefrontFixture({
      branches: [branch({ openingHours: [{ dayOfWeek: 1, opensAt: '12:00', closesAt: '22:00' }] })],
    });
    expect(getStoreAvailability(mondaysOnly, karachiTime('2026-10-30T13:00:00'))).toMatchObject({
      state: 'closed',
      detail: 'Opens Monday at 12:00 pm',
    });
  });

  it('is unavailable when no branch takes online orders', () => {
    const paused = storefrontFixture({ branches: [branch({ isAcceptingOrders: false })] });
    expect(getStoreAvailability(paused, karachiTime('2026-10-30T13:00:00')).state).toBe(
      'unavailable',
    );
    const noFulfillment = storefrontFixture({
      branches: [branch({ pickupEnabled: false, delivery: null })],
    });
    expect(getStoreAvailability(noFulfillment, karachiTime('2026-10-30T13:00:00')).state).toBe(
      'unavailable',
    );
    expect(getStoreAvailability(storefrontFixture({ branches: [] }), new Date()).label).toBe(
      'Not taking online orders',
    );
  });

  it('is unavailable when hours were never published', () => {
    const noHours = storefrontFixture({ branches: [branch({ openingHours: [] })] });
    expect(getStoreAvailability(noHours, new Date())).toMatchObject({
      state: 'unavailable',
      detail: 'Opening hours have not been published yet.',
    });
  });
});

describe('formatClockTime', () => {
  it('formats 24-hour times for customers', () => {
    expect(formatClockTime('00:00')).toBe('12:00 am');
    expect(formatClockTime('12:30')).toBe('12:30 pm');
    expect(formatClockTime('23:05')).toBe('11:05 pm');
  });
});
