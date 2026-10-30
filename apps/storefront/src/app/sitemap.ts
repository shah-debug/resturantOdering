import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { storefrontPath } from '@/features/storefront/seo';
import { siteUrl } from '@/server/env';
import { listStorefronts } from '@/server/storefront-api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = siteUrl();
  const restaurants = await listStorefronts();
  return restaurants.map((restaurant) => ({
    url: `${base}${storefrontPath(restaurant.slug)}`,
    lastModified: restaurant.updatedAt,
    changeFrequency: 'daily',
    priority: 0.8,
  }));
}
