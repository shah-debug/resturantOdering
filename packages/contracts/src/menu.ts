import { z } from 'zod';

export const MENU_LIMITS = {
  variantPriceMaxMinor: 10_000_000,
  addOnPriceMaxMinor: 5_000_000,
  variantsPerProduct: 20,
  addOnGroupsPerProduct: 10,
  addOnsPerGroup: 30,
  imageMaxBytes: 5 * 1024 * 1024,
} as const;

export const MENU_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MenuImageType = (typeof MENU_IMAGE_TYPES)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof productStatusSchema>;

const uniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length;
const normalizedName = (name: string) => name.trim().toLowerCase();

function duplicateNameIndex(items: readonly { name: string }[]): number {
  const seen = new Set<string>();
  return items.findIndex((item) => {
    const key = normalizedName(item.name);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
    return false;
  });
}

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  productCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = createCategoryRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

export const reorderRequestSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500).refine(uniqueIds, 'Each item may appear only once'),
});
export type ReorderRequest = z.infer<typeof reorderRequestSchema>;

export const variantInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  priceMinor: z.number().int().min(0).max(MENU_LIMITS.variantPriceMaxMinor),
  sku: z.string().trim().min(1).max(64).nullable().optional(),
  isAvailable: z.boolean(),
  isDefault: z.boolean(),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const productUpsertRequestSchema = z
  .object({
    categoryId: z.uuid(),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    status: productStatusSchema,
    isAvailable: z.boolean(),
    variants: z.array(variantInputSchema).min(1).max(MENU_LIMITS.variantsPerProduct),
    addOnGroupIds: z
      .array(z.uuid())
      .max(MENU_LIMITS.addOnGroupsPerProduct)
      .refine(uniqueIds, 'Each customization group may be added only once'),
  })
  .superRefine((value, ctx) => {
    const defaults = value.variants.filter((variant) => variant.isDefault).length;
    if (defaults !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Choose exactly one default option',
      });
    }
    const duplicate = duplicateNameIndex(value.variants);
    if (duplicate >= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants', duplicate, 'name'],
        message: 'Option names must be unique',
      });
    }
    if (value.status === 'PUBLISHED' && !value.variants.some((variant) => variant.isAvailable)) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'A published product needs at least one available option',
      });
    }
  });
export type ProductUpsertRequest = z.infer<typeof productUpsertRequestSchema>;

export const productPatchRequestSchema = z
  .object({
    status: productStatusSchema.optional(),
    isAvailable: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type ProductPatchRequest = z.infer<typeof productPatchRequestSchema>;

export const productVariantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sku: z.string().nullable(),
  priceMinor: z.number().int(),
  isAvailable: z.boolean(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
});
export type ProductVariant = z.infer<typeof productVariantSchema>;

export const productSummarySchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  categoryName: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  status: productStatusSchema,
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
  priceFromMinor: z.number().int().nullable(),
  variantCount: z.number().int(),
  updatedAt: z.iso.datetime(),
});
export type ProductSummary = z.infer<typeof productSummarySchema>;

export const productAddOnGroupRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
});

export const productDetailSchema = productSummarySchema.extend({
  variants: z.array(productVariantSchema),
  addOnGroups: z.array(productAddOnGroupRefSchema),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

export const productListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.uuid().optional(),
  status: productStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const addOnInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  priceMinor: z.number().int().min(0).max(MENU_LIMITS.addOnPriceMaxMinor),
  isAvailable: z.boolean(),
});
export type AddOnInput = z.infer<typeof addOnInputSchema>;

export const addOnGroupUpsertRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    minSelect: z.number().int().min(0).max(MENU_LIMITS.addOnsPerGroup),
    maxSelect: z.number().int().min(1).max(MENU_LIMITS.addOnsPerGroup),
    addOns: z.array(addOnInputSchema).min(1).max(MENU_LIMITS.addOnsPerGroup),
  })
  .superRefine((value, ctx) => {
    if (value.minSelect > value.maxSelect) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSelect'],
        message: 'Minimum cannot exceed maximum',
      });
    }
    if (value.maxSelect > value.addOns.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxSelect'],
        message: 'Maximum cannot exceed the number of options',
      });
    }
    const available = value.addOns.filter((addOn) => addOn.isAvailable).length;
    if (value.minSelect > available) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSelect'],
        message: 'Not enough available options to meet the minimum',
      });
    }
    const duplicate = duplicateNameIndex(value.addOns);
    if (duplicate >= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['addOns', duplicate, 'name'],
        message: 'Option names must be unique',
      });
    }
  });
export type AddOnGroupUpsertRequest = z.infer<typeof addOnGroupUpsertRequestSchema>;

export const addOnSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceMinor: z.number().int(),
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
});
export type AddOn = z.infer<typeof addOnSchema>;

export const addOnGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  addOns: z.array(addOnSchema),
  productCount: z.number().int().min(0),
});
export type AddOnGroup = z.infer<typeof addOnGroupSchema>;
