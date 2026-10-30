import { z } from 'zod';

const DEV_API_ORIGIN = 'http://localhost:4000';
const DEV_SITE_URL = 'http://localhost:3001';
const DEFAULT_REVALIDATE_SECONDS = 30;

const isProduction = () => process.env.NODE_ENV === 'production';

function readUrl(name: string, value: string | undefined, devDefault: string): string {
  const schema = isProduction() ? z.url() : z.url().default(devDefault);
  const result = schema.safeParse(value || undefined);
  if (!result.success) {
    throw new Error(`${name} must be set to a valid URL`);
  }
  return result.data.replace(/\/$/, '');
}

export function apiOrigin(): string {
  return readUrl('API_ORIGIN', process.env.API_ORIGIN, DEV_API_ORIGIN);
}

export function siteUrl(): string {
  return readUrl('SITE_URL', process.env.SITE_URL, DEV_SITE_URL);
}

export function revalidateSeconds(): number {
  const result = z.coerce
    .number()
    .int()
    .min(0)
    .max(3600)
    .default(DEFAULT_REVALIDATE_SECONDS)
    .safeParse(process.env.STOREFRONT_REVALIDATE_SECONDS || undefined);
  return result.success ? result.data : DEFAULT_REVALIDATE_SECONDS;
}
