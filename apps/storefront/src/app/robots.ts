import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { siteUrl } from '@/server/env';

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const base = siteUrl();
  return {
    rules: [{ userAgent: '*', allow: '/r/', disallow: ['/api/'] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
