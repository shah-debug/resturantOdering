import {
  API_PREFIX,
  isStorefrontSlug,
  ORDER_TOKEN_HEADER,
  type OrderTracking,
  orderTrackingSchema,
  orderTrackingTokenSchema,
  type Storefront,
  type StorefrontDirectoryEntry,
  storefrontDirectorySchema,
  storefrontSchema,
} from '@app/contracts';
import { cache } from 'react';
import { z } from 'zod';
import { apiOrigin, revalidateSeconds } from './env';

export class StorefrontApiError extends Error {}

export function storefrontCacheTag(slug: string): string {
  return `storefront:${slug}`;
}

async function getJson(path: string, tags: string[]): Promise<unknown> {
  const response = await fetch(`${apiOrigin()}/${API_PREFIX}/storefront/restaurants${path}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: revalidateSeconds(), tags },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new StorefrontApiError(`Storefront API responded with HTTP ${response.status}`);
  }
  return response.json();
}

export const getStorefront = cache(async (slug: string): Promise<Storefront | null> => {
  if (!isStorefrontSlug(slug)) {
    return null;
  }
  const body = await getJson(`/${slug}`, [storefrontCacheTag(slug)]);
  return body === null ? null : storefrontSchema.parse(body);
});

export async function listStorefronts(): Promise<StorefrontDirectoryEntry[]> {
  const body = await getJson('', ['storefront:directory']);
  return body === null ? [] : storefrontDirectorySchema.parse(body);
}

export async function getOrderTracking(
  slug: string,
  orderId: string,
  token: string,
): Promise<OrderTracking | null> {
  if (
    !isStorefrontSlug(slug) ||
    !z.uuid().safeParse(orderId).success ||
    !orderTrackingTokenSchema.safeParse(token).success
  ) {
    return null;
  }
  const response = await fetch(
    `${apiOrigin()}/${API_PREFIX}/storefront/restaurants/${slug}/orders/${orderId}`,
    { headers: { Accept: 'application/json', [ORDER_TOKEN_HEADER]: token }, cache: 'no-store' },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new StorefrontApiError(`Order tracking responded with HTTP ${response.status}`);
  }
  return orderTrackingSchema.parse(await response.json());
}
