import {
  DAYS_OF_WEEK,
  getOpenStatus,
  MINUTES_PER_DAY,
  minuteOfWeek,
  type Storefront,
  type StorefrontBranch,
  timeToMinutes,
  type UpcomingMoment,
} from '@app/contracts';

export type StoreState = 'open' | 'closed' | 'unavailable';

export interface StoreAvailability {
  state: StoreState;
  label: string;
  detail: string | null;
}

export function formatClockTime(time: string): string {
  const minutes = timeToMinutes(time);
  const hours = Math.floor(minutes / 60);
  const suffix = hours < 12 ? 'am' : 'pm';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutes = String(minutes % 60).padStart(2, '0');
  return `${displayHour}:${displayMinutes} ${suffix}`;
}

function describeMoment(moment: UpcomingMoment, currentMinuteOfDay: number): string {
  const dayOffset = Math.floor((currentMinuteOfDay + moment.inMinutes) / MINUTES_PER_DAY);
  const time = formatClockTime(moment.time);
  if (dayOffset === 0) {
    return `today at ${time}`;
  }
  if (dayOffset === 1) {
    return `tomorrow at ${time}`;
  }
  const day = DAYS_OF_WEEK.find((item) => item.value === moment.dayOfWeek)?.label ?? '';
  return `${day} at ${time}`;
}

export function takesOnlineOrders(branch: StorefrontBranch): boolean {
  return branch.isAcceptingOrders && (branch.pickupEnabled || branch.delivery !== null);
}

export function getStoreAvailability(storefront: Storefront, now: Date): StoreAvailability {
  const branches = storefront.branches.filter(takesOnlineOrders);
  if (branches.length === 0) {
    return {
      state: 'unavailable',
      label: 'Not taking online orders',
      detail: 'You can still browse the menu.',
    };
  }

  const currentMinuteOfDay = minuteOfWeek(now, storefront.timezone) % MINUTES_PER_DAY;
  const statuses = branches.map((branch) =>
    getOpenStatus(branch.openingHours, storefront.timezone, now),
  );

  const closingTimes = statuses
    .map((status) => status.closesAt)
    .filter((moment): moment is UpcomingMoment => moment !== null);
  if (closingTimes.length > 0) {
    const latest = closingTimes.reduce((a, b) => (b.inMinutes > a.inMinutes ? b : a));
    return {
      state: 'open',
      label: 'Open now',
      detail: `Closes ${describeMoment(latest, currentMinuteOfDay)}`,
    };
  }

  const openings = statuses
    .map((status) => status.nextOpening)
    .filter((moment): moment is UpcomingMoment => moment !== null);
  if (openings.length === 0) {
    return {
      state: 'unavailable',
      label: 'Not taking online orders',
      detail: 'Opening hours have not been published yet.',
    };
  }
  const soonest = openings.reduce((a, b) => (b.inMinutes < a.inMinutes ? b : a));
  return {
    state: 'closed',
    label: 'Closed now',
    detail: `Opens ${describeMoment(soonest, currentMinuteOfDay)}`,
  };
}
