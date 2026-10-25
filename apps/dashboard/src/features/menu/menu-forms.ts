import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { z } from 'zod';
import {
  type AddOnGroup,
  addOnGroupUpsertRequestSchema,
  type AddOnGroupUpsertRequest,
  MENU_IMAGE_TYPES,
  MENU_LIMITS,
  type ProductDetail,
  type ProductStatus,
  productUpsertRequestSchema,
  type ProductUpsertRequest,
} from '@app/contracts';
import { toApiError } from '@app/web/api';
import type { FieldErrors, ValidationResult } from '@/lib/form';
import { formatRupees, paisaToRupees, rupeesToPaisa } from '@/features/restaurant/money';

let keyCounter = 0;
export function nextRowKey(): string {
  keyCounter += 1;
  return `row-${keyCounter}`;
}

export function getDottedFieldErrors(
  error: FetchBaseQueryError | SerializedError | undefined,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const detail of toApiError(error)?.details ?? []) {
    errors[detail.field.replace(/^body\./, '')] ??= detail.message;
  }
  return errors;
}

type Issue = z.core.$ZodIssue;

function collectIssues(
  issues: readonly Issue[],
  errors: FieldErrors,
  messageFor: (path: string, issue: Issue) => string,
) {
  for (const issue of issues) {
    const path = issue.path.map(String).join('.') || 'form';
    errors[path] ??= messageFor(path, issue);
  }
}

export interface VariantDraft {
  key: string;
  id?: string | undefined;
  name: string;
  price: string;
  sku: string;
  isAvailable: boolean;
  isDefault: boolean;
}

export interface ProductDraft {
  categoryId: string;
  name: string;
  description: string;
  status: ProductStatus;
  isAvailable: boolean;
  variants: VariantDraft[];
  addOnGroupIds: string[];
}

export function newVariantDraft(isDefault: boolean, name = ''): VariantDraft {
  return { key: nextRowKey(), name, price: '', sku: '', isAvailable: true, isDefault };
}

export function emptyProductDraft(categoryId: string): ProductDraft {
  return {
    categoryId,
    name: '',
    description: '',
    status: 'DRAFT',
    isAvailable: true,
    variants: [newVariantDraft(true, 'Regular')],
    addOnGroupIds: [],
  };
}

export function draftFromProduct(product: ProductDetail): ProductDraft {
  return {
    categoryId: product.categoryId,
    name: product.name,
    description: product.description ?? '',
    status: product.status,
    isAvailable: product.isAvailable,
    variants: [...product.variants]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((variant) => ({
        key: variant.id,
        id: variant.id,
        name: variant.name,
        price: paisaToRupees(variant.priceMinor),
        sku: variant.sku ?? '',
        isAvailable: variant.isAvailable,
        isDefault: variant.isDefault,
      })),
    addOnGroupIds: product.addOnGroups.map((group) => group.id),
  };
}

const VARIANT_PRICE_MESSAGE = 'Enter a price in rupees, e.g. 450';

function productMessage(path: string, issue: Issue): string {
  if (path === 'categoryId') return 'Choose a category';
  if (path === 'name') return 'Enter a name between 2 and 160 characters';
  if (path === 'description') return 'Keep the description under 1,000 characters';
  if (path === 'variants') {
    if (issue.code === 'too_small') return 'Add at least one option';
    if (issue.code === 'too_big') {
      return `You can add up to ${MENU_LIMITS.variantsPerProduct} options`;
    }
    return issue.message;
  }
  if (path === 'addOnGroupIds') {
    return issue.code === 'too_big'
      ? `You can add up to ${MENU_LIMITS.addOnGroupsPerProduct} customization groups`
      : issue.message;
  }
  if (path.endsWith('.name')) {
    return issue.code === 'custom' ? issue.message : 'Enter an option name (up to 80 characters)';
  }
  if (path.endsWith('.priceMinor')) {
    return issue.code === 'too_big'
      ? `Price can be at most ${formatRupees(MENU_LIMITS.variantPriceMaxMinor)}`
      : VARIANT_PRICE_MESSAGE;
  }
  if (path.endsWith('.sku')) return 'SKU must be 64 characters or fewer';
  return issue.message;
}

export function buildProductRequest(draft: ProductDraft): ValidationResult<ProductUpsertRequest> {
  const errors: FieldErrors = {};
  const variants = draft.variants.map((variant, index) => {
    const priceMinor = rupeesToPaisa(variant.price);
    if (priceMinor === null) {
      errors[`variants.${index}.priceMinor`] = VARIANT_PRICE_MESSAGE;
    }
    return {
      ...(variant.id ? { id: variant.id } : {}),
      name: variant.name,
      priceMinor: priceMinor ?? 0,
      sku: variant.sku.trim() || null,
      isAvailable: variant.isAvailable,
      isDefault: variant.isDefault,
    };
  });
  const result = productUpsertRequestSchema.safeParse({
    categoryId: draft.categoryId,
    name: draft.name,
    description: draft.description.trim() || null,
    status: draft.status,
    isAvailable: draft.isAvailable,
    variants,
    addOnGroupIds: draft.addOnGroupIds,
  });
  if (!result.success) {
    collectIssues(result.error.issues, errors, productMessage);
  }
  if (!result.success || Object.keys(errors).length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: result.data };
}

export function imageFileError(file: File): string | null {
  if (!(MENU_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a JPEG, PNG or WebP image';
  }
  if (file.size === 0) {
    return 'This file is empty. Choose another image.';
  }
  if (file.size > MENU_LIMITS.imageMaxBytes) {
    return 'Images must be 5 MB or smaller';
  }
  return null;
}

export interface AddOnDraft {
  key: string;
  id?: string | undefined;
  name: string;
  price: string;
  isAvailable: boolean;
}

export interface AddOnGroupDraft {
  name: string;
  required: boolean;
  minSelect: string;
  maxSelect: string;
  addOns: AddOnDraft[];
}

export function newAddOnDraft(): AddOnDraft {
  return { key: nextRowKey(), name: '', price: '0', isAvailable: true };
}

export function emptyAddOnGroupDraft(): AddOnGroupDraft {
  return { name: '', required: false, minSelect: '1', maxSelect: '1', addOns: [newAddOnDraft()] };
}

export function draftFromAddOnGroup(group: AddOnGroup): AddOnGroupDraft {
  return {
    name: group.name,
    required: group.minSelect > 0,
    minSelect: String(Math.max(1, group.minSelect)),
    maxSelect: String(group.maxSelect),
    addOns: [...group.addOns]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((addOn) => ({
        key: addOn.id,
        id: addOn.id,
        name: addOn.name,
        price: paisaToRupees(addOn.priceMinor),
        isAvailable: addOn.isAvailable,
      })),
  };
}

const ADD_ON_PRICE_MESSAGE = 'Enter a price in rupees, 0 for free';

function addOnGroupMessage(path: string, issue: Issue): string {
  if (path === 'name') return 'Enter a name between 2 and 120 characters';
  if (path === 'addOns') {
    if (issue.code === 'too_small') return 'Add at least one option';
    return `You can add up to ${MENU_LIMITS.addOnsPerGroup} options`;
  }
  if (path === 'minSelect' || path === 'maxSelect') {
    return issue.code === 'custom' ? issue.message : 'Enter a whole number';
  }
  if (path.endsWith('.name')) {
    return issue.code === 'custom' ? issue.message : 'Enter an option name (up to 120 characters)';
  }
  if (path.endsWith('.priceMinor')) {
    return issue.code === 'too_big'
      ? `Price can be at most ${formatRupees(MENU_LIMITS.addOnPriceMaxMinor)}`
      : ADD_ON_PRICE_MESSAGE;
  }
  return issue.message;
}

function parseCount(value: string): number | null {
  return /^\d{1,2}$/.test(value.trim()) ? Number(value.trim()) : null;
}

export function buildAddOnGroupRequest(
  draft: AddOnGroupDraft,
): ValidationResult<AddOnGroupUpsertRequest> {
  const errors: FieldErrors = {};
  const minSelect = draft.required ? parseCount(draft.minSelect) : 0;
  const maxSelect = parseCount(draft.maxSelect);
  if (minSelect === null || (draft.required && minSelect < 1)) {
    errors.minSelect = 'A required group needs at least 1 choice';
  }
  if (maxSelect === null || maxSelect < 1) {
    errors.maxSelect = 'Enter at least 1';
  }
  const addOns = draft.addOns.map((addOn, index) => {
    const priceMinor = rupeesToPaisa(addOn.price);
    if (priceMinor === null) {
      errors[`addOns.${index}.priceMinor`] = ADD_ON_PRICE_MESSAGE;
    }
    return {
      ...(addOn.id ? { id: addOn.id } : {}),
      name: addOn.name,
      priceMinor: priceMinor ?? 0,
      isAvailable: addOn.isAvailable,
    };
  });
  const result = addOnGroupUpsertRequestSchema.safeParse({
    name: draft.name,
    minSelect: minSelect ?? 0,
    maxSelect: maxSelect ?? 1,
    addOns,
  });
  if (!result.success) {
    collectIssues(result.error.issues, errors, addOnGroupMessage);
  }
  if (!result.success || Object.keys(errors).length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: result.data };
}

export function selectionSummary({
  minSelect,
  maxSelect,
}: Pick<AddOnGroup, 'minSelect' | 'maxSelect'>): string {
  if (minSelect > 0) {
    return minSelect === maxSelect
      ? `Required: choose ${minSelect}`
      : `Required: choose ${minSelect} to ${maxSelect}`;
  }
  return `Optional: up to ${maxSelect}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
