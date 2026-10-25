import type { AddOnGroup, Category, ProductDetail, ProductSummary } from '@app/contracts';

export const CATEGORY_IDS = [
  'c1111111-1111-4111-8111-111111111111',
  'c2222222-2222-4222-8222-222222222222',
  'c3333333-3333-4333-8333-333333333333',
] as const;

export const PRODUCT_ID = 'd1111111-1111-4111-8111-111111111111';
export const SECOND_PRODUCT_ID = 'd2222222-2222-4222-8222-222222222222';
export const VARIANT_IDS = [
  'e1111111-1111-4111-8111-111111111111',
  'e2222222-2222-4222-8222-222222222222',
] as const;
export const GROUP_IDS = [
  'f1111111-1111-4111-8111-111111111111',
  'f2222222-2222-4222-8222-222222222222',
] as const;

const CREATED_AT = '2026-01-01T00:00:00.000Z';

export function categoryFixture(overrides: Partial<Category> = {}): Category {
  return {
    id: CATEGORY_IDS[0],
    name: 'Starters',
    slug: 'starters',
    description: null,
    isActive: true,
    sortOrder: 0,
    productCount: 2,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

export function categoriesFixture(): Category[] {
  return [
    categoryFixture(),
    categoryFixture({ id: CATEGORY_IDS[1], name: 'Mains', slug: 'mains', sortOrder: 1 }),
    categoryFixture({
      id: CATEGORY_IDS[2],
      name: 'Drinks',
      slug: 'drinks',
      sortOrder: 2,
      productCount: 0,
    }),
  ];
}

export function productSummaryFixture(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: PRODUCT_ID,
    categoryId: CATEGORY_IDS[0],
    categoryName: 'Starters',
    name: 'Chicken Tikka',
    slug: 'chicken-tikka',
    description: null,
    imageUrl: null,
    status: 'DRAFT',
    isAvailable: true,
    sortOrder: 0,
    priceFromMinor: 45000,
    variantCount: 2,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

export function productDetailFixture(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    ...productSummaryFixture(),
    variants: [
      {
        id: VARIANT_IDS[0],
        name: 'Half',
        sku: null,
        priceMinor: 45000,
        isAvailable: true,
        isDefault: true,
        sortOrder: 0,
      },
      {
        id: VARIANT_IDS[1],
        name: 'Full',
        sku: 'TIKKA-F',
        priceMinor: 80000,
        isAvailable: true,
        isDefault: false,
        sortOrder: 1,
      },
    ],
    addOnGroups: [],
    ...overrides,
  };
}

export function addOnGroupFixture(overrides: Partial<AddOnGroup> = {}): AddOnGroup {
  return {
    id: GROUP_IDS[0],
    name: 'Choose a drink',
    minSelect: 1,
    maxSelect: 1,
    addOns: [
      {
        id: 'a1111111-1111-4111-8111-111111111111',
        name: 'Cola',
        priceMinor: 0,
        isAvailable: true,
        sortOrder: 0,
      },
      {
        id: 'a2222222-2222-4222-8222-222222222222',
        name: 'Lassi',
        priceMinor: 15000,
        isAvailable: true,
        sortOrder: 1,
      },
    ],
    productCount: 3,
    ...overrides,
  };
}

export function page<T>(
  items: T[],
  overrides: { page?: number; pageSize?: number; total?: number } = {},
) {
  return { items, page: 1, pageSize: 20, total: items.length, ...overrides };
}
