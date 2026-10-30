import { addLocalDays, localDateOf, localDaysBetween, startOfLocalDay } from './zoned-dates';

describe('zoned dates', () => {
  it('starts a Karachi day at 19:00 UTC the evening before', () => {
    expect(startOfLocalDay('2026-10-31', 'Asia/Karachi').toISOString()).toBe(
      '2026-10-30T19:00:00.000Z',
    );
  });

  it('handles daylight saving changes', () => {
    expect(startOfLocalDay('2026-03-29', 'Europe/London').toISOString()).toBe(
      '2026-03-29T00:00:00.000Z',
    );
    expect(startOfLocalDay('2026-03-30', 'Europe/London').toISOString()).toBe(
      '2026-03-29T23:00:00.000Z',
    );
    const days = localDaysBetween('2026-03-28', '2026-03-30', 'Europe/London');
    expect(days.map((day) => (day.endsAt.getTime() - day.startsAt.getTime()) / 3_600_000)).toEqual([
      24, 23, 24,
    ]);
  });

  it('works across month and year ends', () => {
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addLocalDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(localDaysBetween('2026-12-30', '2027-01-02', 'UTC').map((day) => day.date)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('finds the local calendar date of an instant', () => {
    const lateEvening = new Date('2026-10-30T19:30:00Z');
    expect(localDateOf(lateEvening, 'Asia/Karachi')).toBe('2026-10-31');
    expect(localDateOf(lateEvening, 'UTC')).toBe('2026-10-30');
  });
});
