import { type Branch, minutesToTime } from '@app/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { BranchStatus } from '../../generated/prisma/enums.js';

export const DEFAULT_DELIVERY_ZONE_NAME = 'Standard delivery';

export const branchSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  isAcceptingOrders: true,
  phone: true,
  addressLine: true,
  area: true,
  city: true,
  deliveryEnabled: true,
  pickupEnabled: true,
  preparationMinutes: true,
  createdAt: true,
  openingHours: {
    orderBy: [{ dayOfWeek: 'asc' }, { opensAtMinutes: 'asc' }],
    select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true },
  },
  deliveryZones: {
    where: { name: DEFAULT_DELIVERY_ZONE_NAME, archivedAt: null },
    take: 1,
    select: { feeMinor: true, minOrderMinor: true, estimatedMinutes: true },
  },
} satisfies Prisma.BranchSelect;

export interface BranchRow {
  id: string;
  name: string;
  slug: string;
  status: BranchStatus;
  isAcceptingOrders: boolean;
  phone: string | null;
  addressLine: string;
  area: string | null;
  city: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  preparationMinutes: number;
  createdAt: Date;
  openingHours: { dayOfWeek: number; opensAtMinutes: number; closesAtMinutes: number }[];
  deliveryZones: { feeMinor: number; minOrderMinor: number; estimatedMinutes: number }[];
}

export function toBranch(row: BranchRow): Branch {
  const { openingHours, deliveryZones, createdAt, ...rest } = row;
  const zone = deliveryZones[0];
  return {
    ...rest,
    delivery: zone
      ? {
          feeMinor: zone.feeMinor,
          minimumOrderMinor: zone.minOrderMinor,
          estimatedMinutes: zone.estimatedMinutes,
        }
      : null,
    openingHours: openingHours.map((interval) => ({
      dayOfWeek: interval.dayOfWeek,
      opensAt: minutesToTime(interval.opensAtMinutes),
      closesAt: minutesToTime(interval.closesAtMinutes),
    })),
    createdAt: createdAt.toISOString(),
  };
}

export function slugifyBranchName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return slug.length >= 1 ? slug : 'branch';
}
