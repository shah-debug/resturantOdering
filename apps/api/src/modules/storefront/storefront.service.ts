import { HttpStatus, Injectable } from '@nestjs/common';
import {
  isStorefrontSlug,
  minutesToTime,
  type Storefront,
  type StorefrontBranch,
  type StorefrontCategory,
  type StorefrontDirectoryEntry,
} from '@app/contracts';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DEFAULT_DELIVERY_ZONE_NAME } from '../branches/branch.mapper.js';
import {
  publishedOrganization,
  sortByPosition,
  storefrontProductSelect,
  toStorefrontProduct,
} from './storefront-menu.js';

export const STOREFRONT_DIRECTORY_LIMIT = 10_000;

const branchSelect = {
  id: true,
  name: true,
  phone: true,
  addressLine: true,
  area: true,
  city: true,
  isAcceptingOrders: true,
  deliveryEnabled: true,
  pickupEnabled: true,
  preparationMinutes: true,
  openingHours: {
    orderBy: [{ dayOfWeek: 'asc' }, { opensAtMinutes: 'asc' }],
    select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true },
  },
  deliveryZones: {
    where: { name: DEFAULT_DELIVERY_ZONE_NAME, archivedAt: null, isActive: true },
    take: 1,
    select: { feeMinor: true, minOrderMinor: true, estimatedMinutes: true },
  },
} satisfies Prisma.BranchSelect;

type BranchRow = Prisma.BranchGetPayload<{ select: typeof branchSelect }>;

function toBranch(row: BranchRow): StorefrontBranch {
  const zone = row.deliveryEnabled ? row.deliveryZones[0] : undefined;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    addressLine: row.addressLine,
    area: row.area,
    city: row.city,
    isAcceptingOrders: row.isAcceptingOrders,
    pickupEnabled: row.pickupEnabled,
    preparationMinutes: row.preparationMinutes,
    delivery: zone
      ? {
          feeMinor: zone.feeMinor,
          minimumOrderMinor: zone.minOrderMinor,
          estimatedMinutes: zone.estimatedMinutes,
        }
      : null,
    openingHours: row.openingHours.map((interval) => ({
      dayOfWeek: interval.dayOfWeek,
      opensAt: minutesToTime(interval.opensAtMinutes),
      closesAt: minutesToTime(interval.closesAtMinutes),
    })),
  };
}

function restaurantNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Restaurant not found');
}

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  async directory(): Promise<StorefrontDirectoryEntry[]> {
    const rows = await this.prisma.organization.findMany({
      where: publishedOrganization,
      orderBy: { slug: 'asc' },
      take: STOREFRONT_DIRECTORY_LIMIT,
      select: { slug: true, updatedAt: true },
    });
    return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
  }

  async findBySlug(slug: string): Promise<Storefront> {
    if (!isStorefrontSlug(slug)) {
      throw restaurantNotFound();
    }
    const organization = await this.prisma.organization.findFirst({
      where: { slug, ...publishedOrganization },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        logoUrl: true,
        primaryColor: true,
        currency: true,
        timezone: true,
      },
    });
    if (!organization) {
      throw restaurantNotFound();
    }

    const { id: organizationId, ...profile } = organization;
    const [branches, categories] = await Promise.all([
      this.prisma.branch.findMany({
        where: { organizationId, status: 'ACTIVE' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: branchSelect,
      }),
      this.prisma.category.findMany({
        where: { organizationId, isActive: true, archivedAt: null },
        orderBy: [...sortByPosition],
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          products: {
            where: { organizationId, status: 'PUBLISHED', archivedAt: null },
            orderBy: [...sortByPosition],
            select: storefrontProductSelect,
          },
        },
      }),
    ]);

    const menu: StorefrontCategory[] = categories
      .filter((category) => category.products.length > 0)
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        products: category.products.map(toStorefrontProduct),
      }));

    return {
      ...profile,
      primaryColor: profile.primaryColor?.trim() ?? null,
      branches: branches.map(toBranch),
      categories: menu,
    };
  }
}
