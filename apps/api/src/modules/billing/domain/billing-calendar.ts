import { addLocalDays, localDateOf, startOfLocalDay } from '../../../common/time/zoned-dates.js';

export type BillingInterval = 'MONTHLY' | 'YEARLY';

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parse(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year ?? 1970, month ?? 1, day ?? 1];
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function anchorDayOf(localDate: string): number {
  return parse(localDate)[2];
}

export function nextAnchorDate(
  localDate: string,
  anchorDay: number,
  interval: BillingInterval,
): string {
  const [year, month] = parse(localDate);
  const months = interval === 'MONTHLY' ? 1 : 12;
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return format(targetYear, targetMonth, Math.min(anchorDay, daysInMonth(targetYear, targetMonth)));
}

export interface BillingPeriod {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
}

export function billingPeriod(
  startDate: string,
  anchorDay: number,
  interval: BillingInterval,
  timeZone: string,
): BillingPeriod {
  const endDate = nextAnchorDate(startDate, anchorDay, interval);
  return {
    start: startOfLocalDay(startDate, timeZone),
    end: startOfLocalDay(endDate, timeZone),
    startDate,
    endDate,
  };
}

export function localDayStart(instant: Date, timeZone: string): Date {
  return startOfLocalDay(localDateOf(instant, timeZone), timeZone);
}

export function addLocalDaysTo(instant: Date, days: number, timeZone: string): Date {
  return startOfLocalDay(addLocalDays(localDateOf(instant, timeZone), days), timeZone);
}

export function wholeLocalDaysBetween(from: Date, to: Date, timeZone: string): number {
  const start = Date.parse(`${localDateOf(from, timeZone)}T00:00:00Z`);
  const end = Date.parse(`${localDateOf(to, timeZone)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
