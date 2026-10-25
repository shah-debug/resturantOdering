import { DAYS_OF_WEEK, type OpeningInterval, timeToMinutes } from '@app/contracts';

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function dayOfWeekIn(timeZone: string, now: Date = new Date()): number {
  try {
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now);
    return WEEKDAY_INDEX[weekday] ?? 1;
  } catch {
    return now.getDay() === 0 ? 7 : now.getDay();
  }
}

export function dayLabel(dayOfWeek: number): string {
  return DAYS_OF_WEEK.find((day) => day.value === dayOfWeek)?.label ?? '';
}

export function isOvernight(interval: Pick<OpeningInterval, 'opensAt' | 'closesAt'>): boolean {
  return timeToMinutes(interval.closesAt) <= timeToMinutes(interval.opensAt);
}

export function formatTime(time: string): string {
  const minutes = timeToMinutes(time);
  const hours24 = Math.floor(minutes / 60);
  const suffix = hours24 < 12 ? 'am' : 'pm';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes % 60).padStart(2, '0')} ${suffix}`;
}

export function intervalsForDay(
  intervals: readonly OpeningInterval[],
  dayOfWeek: number,
): OpeningInterval[] {
  return intervals
    .filter((interval) => interval.dayOfWeek === dayOfWeek)
    .sort((a, b) => timeToMinutes(a.opensAt) - timeToMinutes(b.opensAt));
}

export function describeDay(intervals: readonly OpeningInterval[], dayOfWeek: number): string {
  const day = intervalsForDay(intervals, dayOfWeek);
  if (day.length === 0) {
    return 'Closed';
  }
  return day
    .map(
      (interval) =>
        `${formatTime(interval.opensAt)} – ${formatTime(interval.closesAt)}${
          isOvernight(interval) ? ' (next day)' : ''
        }`,
    )
    .join(', ');
}
