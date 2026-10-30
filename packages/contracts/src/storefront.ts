import { z } from 'zod';
import {
  MINUTES_PER_DAY,
  minutesToTime,
  type OpeningInterval,
  openingIntervalSchema,
  openingIntervalWeekSpan,
} from './onboarding.js';

const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export const STOREFRONT_SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/;

export function isStorefrontSlug(value: string): boolean {
  return STOREFRONT_SLUG_PATTERN.test(value);
}

export const CART_LIMITS = {
  maxQuantityPerLine: 50,
  maxLines: 50,
} as const;

export const storefrontAddOnSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceMinor: z.number().int().min(0),
  isAvailable: z.boolean(),
});
export type StorefrontAddOn = z.infer<typeof storefrontAddOnSchema>;

export const storefrontAddOnGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  minSelect: z.number().int().min(0),
  maxSelect: z.number().int().min(1),
  addOns: z.array(storefrontAddOnSchema),
});
export type StorefrontAddOnGroup = z.infer<typeof storefrontAddOnGroupSchema>;

export const storefrontVariantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceMinor: z.number().int().min(0),
  isAvailable: z.boolean(),
  isDefault: z.boolean(),
});
export type StorefrontVariant = z.infer<typeof storefrontVariantSchema>;

export const storefrontProductSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  isAvailable: z.boolean(),
  variants: z.array(storefrontVariantSchema),
  addOnGroups: z.array(storefrontAddOnGroupSchema),
});
export type StorefrontProduct = z.infer<typeof storefrontProductSchema>;

export const storefrontCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  products: z.array(storefrontProductSchema),
});
export type StorefrontCategory = z.infer<typeof storefrontCategorySchema>;

export const storefrontBranchSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  addressLine: z.string(),
  area: z.string().nullable(),
  city: z.string(),
  isAcceptingOrders: z.boolean(),
  pickupEnabled: z.boolean(),
  preparationMinutes: z.number().int(),
  delivery: z
    .object({
      feeMinor: z.number().int().min(0),
      minimumOrderMinor: z.number().int().min(0),
      estimatedMinutes: z.number().int(),
    })
    .nullable(),
  openingHours: z.array(openingIntervalSchema),
});
export type StorefrontBranch = z.infer<typeof storefrontBranchSchema>;

export const storefrontSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  currency: z.string(),
  timezone: z.string(),
  branches: z.array(storefrontBranchSchema),
  categories: z.array(storefrontCategorySchema),
});
export type Storefront = z.infer<typeof storefrontSchema>;

export const storefrontDirectoryEntrySchema = z.object({
  slug: z.string(),
  updatedAt: z.iso.datetime(),
});
export const storefrontDirectorySchema = z.array(storefrontDirectoryEntrySchema);
export type StorefrontDirectoryEntry = z.infer<typeof storefrontDirectoryEntrySchema>;

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function minuteOfWeek(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  const day = WEEKDAY_INDEX[part('weekday')] ?? 1;
  return (day - 1) * MINUTES_PER_DAY + Number(part('hour')) * 60 + Number(part('minute'));
}

export interface WeekMoment {
  dayOfWeek: number;
  time: string;
}

export interface UpcomingMoment extends WeekMoment {
  inMinutes: number;
}

export interface OpenStatus {
  isOpen: boolean;
  closesAt: UpcomingMoment | null;
  nextOpening: UpcomingMoment | null;
}

function toWeekMoment(weekMinute: number): WeekMoment {
  const normalized = ((weekMinute % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  return {
    dayOfWeek: Math.floor(normalized / MINUTES_PER_DAY) + 1,
    time: minutesToTime(normalized % MINUTES_PER_DAY),
  };
}

export function getOpenStatus(
  intervals: readonly OpeningInterval[],
  timeZone: string,
  now: Date,
): OpenStatus {
  const current = minuteOfWeek(now, timeZone);
  const spans = intervals.map(openingIntervalWeekSpan);
  for (const span of spans) {
    for (const shift of [0, MINUTES_PER_WEEK]) {
      const at = current + shift;
      if (at >= span.start && at < span.end) {
        return {
          isOpen: true,
          closesAt: { ...toWeekMoment(span.end), inMinutes: span.end - at },
          nextOpening: null,
        };
      }
    }
  }
  let soonest: number | null = null;
  for (const span of spans) {
    const wait =
      (((span.start - current) % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
    if (soonest === null || wait < soonest) {
      soonest = wait;
    }
  }
  return {
    isOpen: false,
    closesAt: null,
    nextOpening:
      soonest === null ? null : { ...toWeekMoment(current + soonest), inMinutes: soonest },
  };
}

export interface CartSelection {
  productId: string;
  variantId: string;
  addOnIds: readonly string[];
}

export type SelectionResult =
  | {
      ok: true;
      product: StorefrontProduct;
      variant: StorefrontVariant;
      addOns: StorefrontAddOn[];
      unitPriceMinor: number;
    }
  | { ok: false; reason: string };

export function findStorefrontProduct(
  categories: readonly StorefrontCategory[],
  productId: string,
): StorefrontProduct | null {
  for (const category of categories) {
    const product = category.products.find((item) => item.id === productId);
    if (product) {
      return product;
    }
  }
  return null;
}

export function groupSelectionError(
  group: StorefrontAddOnGroup,
  selectedCount: number,
): string | null {
  if (selectedCount < group.minSelect) {
    return group.minSelect === 1
      ? `Choose an option for ${group.name}`
      : `Choose at least ${group.minSelect} for ${group.name}`;
  }
  if (selectedCount > group.maxSelect) {
    return `Choose up to ${group.maxSelect} for ${group.name}`;
  }
  return null;
}

export function resolveSelection(
  categories: readonly StorefrontCategory[],
  selection: CartSelection,
): SelectionResult {
  const product = findStorefrontProduct(categories, selection.productId);
  if (!product) {
    return { ok: false, reason: 'No longer on the menu' };
  }
  return resolveProductSelection(product, selection);
}

export function resolveProductSelection(
  product: StorefrontProduct,
  selection: Omit<CartSelection, 'productId'>,
): SelectionResult {
  if (!product.isAvailable) {
    return { ok: false, reason: 'Sold out' };
  }
  const variant = product.variants.find((item) => item.id === selection.variantId);
  if (!variant) {
    return { ok: false, reason: 'This option is no longer offered' };
  }
  if (!variant.isAvailable) {
    return { ok: false, reason: `${variant.name} is sold out` };
  }
  if (new Set(selection.addOnIds).size !== selection.addOnIds.length) {
    return { ok: false, reason: 'Each extra can be chosen once' };
  }

  const chosen = new Set(selection.addOnIds);
  const addOns: StorefrontAddOn[] = [];
  for (const group of product.addOnGroups) {
    const picked = group.addOns.filter((addOn) => chosen.has(addOn.id));
    const unavailable = picked.find((addOn) => !addOn.isAvailable);
    if (unavailable) {
      return { ok: false, reason: `${unavailable.name} is sold out` };
    }
    const error = groupSelectionError(group, picked.length);
    if (error) {
      return { ok: false, reason: error };
    }
    for (const addOn of picked) {
      chosen.delete(addOn.id);
      addOns.push(addOn);
    }
  }
  if (chosen.size > 0) {
    return { ok: false, reason: 'Some extras are no longer offered' };
  }

  const unitPriceMinor =
    variant.priceMinor + addOns.reduce((sum, addOn) => sum + addOn.priceMinor, 0);
  return { ok: true, product, variant, addOns, unitPriceMinor };
}
