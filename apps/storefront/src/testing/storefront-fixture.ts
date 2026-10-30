import type { Storefront, StorefrontBranch, StorefrontProduct } from '@app/contracts';

export const IDS = {
  karahi: '018f0000-0000-7000-8000-000000000001',
  karahiHalf: '018f0000-0000-7000-8000-000000000002',
  karahiFull: '018f0000-0000-7000-8000-000000000003',
  breadGroup: '018f0000-0000-7000-8000-000000000004',
  naan: '018f0000-0000-7000-8000-000000000005',
  roghni: '018f0000-0000-7000-8000-000000000006',
  extrasGroup: '018f0000-0000-7000-8000-000000000007',
  raita: '018f0000-0000-7000-8000-000000000008',
  salad: '018f0000-0000-7000-8000-000000000009',
  lassi: '018f0000-0000-7000-8000-00000000000a',
  lassiRegular: '018f0000-0000-7000-8000-00000000000b',
  kheer: '018f0000-0000-7000-8000-00000000000c',
  kheerBowl: '018f0000-0000-7000-8000-00000000000d',
  mains: '018f0000-0000-7000-8000-00000000000e',
  drinks: '018f0000-0000-7000-8000-00000000000f',
  branch: '018f0000-0000-7000-8000-000000000010',
} as const;

export function karahi(overrides: Partial<StorefrontProduct> = {}): StorefrontProduct {
  return {
    id: IDS.karahi,
    slug: 'chicken-karahi',
    name: 'Chicken Karahi',
    description: 'Slow-cooked with tomatoes and green chillies.',
    imageUrl: null,
    isAvailable: true,
    variants: [
      { id: IDS.karahiHalf, name: 'Half', priceMinor: 145_000, isAvailable: true, isDefault: true },
      {
        id: IDS.karahiFull,
        name: 'Full',
        priceMinor: 270_000,
        isAvailable: true,
        isDefault: false,
      },
    ],
    addOnGroups: [
      {
        id: IDS.breadGroup,
        name: 'Bread',
        minSelect: 1,
        maxSelect: 1,
        addOns: [
          { id: IDS.naan, name: 'Naan', priceMinor: 5_000, isAvailable: true },
          { id: IDS.roghni, name: 'Roghni Naan', priceMinor: 8_000, isAvailable: true },
        ],
      },
      {
        id: IDS.extrasGroup,
        name: 'Extras',
        minSelect: 0,
        maxSelect: 2,
        addOns: [
          { id: IDS.raita, name: 'Raita', priceMinor: 6_000, isAvailable: true },
          { id: IDS.salad, name: 'Salad', priceMinor: 4_000, isAvailable: true },
        ],
      },
    ],
    ...overrides,
  };
}

export function branch(overrides: Partial<StorefrontBranch> = {}): StorefrontBranch {
  return {
    id: IDS.branch,
    name: 'Gulberg',
    phone: '+924235000000',
    addressLine: '12 Main Boulevard',
    area: 'Gulberg III',
    city: 'Lahore',
    isAcceptingOrders: true,
    pickupEnabled: true,
    preparationMinutes: 25,
    delivery: { feeMinor: 15_000, minimumOrderMinor: 200_000, estimatedMinutes: 40 },
    openingHours: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      opensAt: '12:00',
      closesAt: '23:00',
    })),
    ...overrides,
  };
}

export function storefrontFixture(overrides: Partial<Storefront> = {}): Storefront {
  return {
    slug: 'karahi-house',
    name: 'Karahi House',
    description: 'Charcoal karahi and BBQ from Lahore.',
    logoUrl: null,
    primaryColor: '#b45309',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    branches: [branch()],
    categories: [
      {
        id: IDS.mains,
        name: 'Karahi',
        slug: 'karahi',
        description: null,
        products: [karahi()],
      },
      {
        id: IDS.drinks,
        name: 'Drinks and desserts',
        slug: 'drinks',
        description: null,
        products: [
          {
            id: IDS.lassi,
            slug: 'sweet-lassi',
            name: 'Sweet Lassi',
            description: 'Chilled yoghurt drink.',
            imageUrl: null,
            isAvailable: true,
            variants: [
              {
                id: IDS.lassiRegular,
                name: 'Regular',
                priceMinor: 35_000,
                isAvailable: true,
                isDefault: true,
              },
            ],
            addOnGroups: [],
          },
          {
            id: IDS.kheer,
            slug: 'kheer',
            name: 'Kheer',
            description: 'Rice pudding with pistachios.',
            imageUrl: null,
            isAvailable: false,
            variants: [
              {
                id: IDS.kheerBowl,
                name: 'Bowl',
                priceMinor: 30_000,
                isAvailable: true,
                isDefault: true,
              },
            ],
            addOnGroups: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function karachiTime(isoLocal: string): Date {
  return new Date(`${isoLocal}+05:00`);
}
