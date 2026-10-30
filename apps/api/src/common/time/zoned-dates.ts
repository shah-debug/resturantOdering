const DAY_MS = 86_400_000;

function partsIn(instant: number, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
}

function offsetMs(instant: number, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  const asUtc = Date.UTC(
    p.year ?? 1970,
    (p.month ?? 1) - 1,
    p.day ?? 1,
    p.hour ?? 0,
    p.minute ?? 0,
    p.second ?? 0,
  );
  return asUtc - (instant - (instant % 1000));
}

function parseLocalDate(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year ?? 1970, month ?? 1, day ?? 1];
}

export function startOfLocalDay(date: string, timeZone: string): Date {
  const [year, month, day] = parseLocalDate(date);
  const wallClock = Date.UTC(year, month - 1, day);
  const first = wallClock - offsetMs(wallClock, timeZone);
  return new Date(wallClock - offsetMs(first, timeZone));
}

export function addLocalDays(date: string, days: number): string {
  const [year, month, day] = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function localDateOf(instant: Date, timeZone: string): string {
  const p = partsIn(instant.getTime(), timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export interface LocalDay {
  date: string;
  startsAt: Date;
  endsAt: Date;
}

export function localDaysBetween(from: string, to: string, timeZone: string): LocalDay[] {
  const days: LocalDay[] = [];
  for (let date = from; date <= to; date = addLocalDays(date, 1)) {
    days.push({
      date,
      startsAt: startOfLocalDay(date, timeZone),
      endsAt: startOfLocalDay(addLocalDays(date, 1), timeZone),
    });
  }
  return days;
}
