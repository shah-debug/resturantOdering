import type { StorefrontAddOnGroup, StorefrontProduct } from '@app/contracts';
import type { Prisma } from '../../generated/prisma/client.js';

export const publishedOrganization = {
  status: 'ACTIVE',
  onboardingCompletedAt: { not: null },
} satisfies Prisma.OrganizationWhereInput;

export const sortByPosition = [{ sortOrder: 'asc' }, { name: 'asc' }] as const;

export const storefrontProductSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  imageUrl: true,
  isAvailable: true,
  variants: {
    where: { archivedAt: null },
    orderBy: [...sortByPosition],
    select: { id: true, name: true, priceMinor: true, isAvailable: true, isDefault: true },
  },
  addOnGroups: {
    where: { addOnGroup: { archivedAt: null } },
    orderBy: { sortOrder: 'asc' },
    select: {
      addOnGroup: {
        select: {
          id: true,
          name: true,
          minSelect: true,
          maxSelect: true,
          addOns: {
            where: { archivedAt: null },
            orderBy: [...sortByPosition],
            select: { id: true, name: true, priceMinor: true, isAvailable: true },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

export type StorefrontProductRow = Prisma.ProductGetPayload<{
  select: typeof storefrontProductSelect;
}>;

function toAddOnGroup(
  group: StorefrontProductRow['addOnGroups'][number]['addOnGroup'],
): StorefrontAddOnGroup {
  return {
    id: group.id,
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    addOns: group.addOns,
  };
}

export function toStorefrontProduct(row: StorefrontProductRow): StorefrontProduct {
  const addOnGroups = row.addOnGroups.map((link) => toAddOnGroup(link.addOnGroup));
  const canBeOrdered =
    row.isAvailable &&
    row.variants.some((variant) => variant.isAvailable) &&
    addOnGroups.every(
      (group) => group.addOns.filter((addOn) => addOn.isAvailable).length >= group.minSelect,
    );
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    isAvailable: canBeOrdered,
    variants: row.variants,
    addOnGroups,
  };
}
