import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { NONCE_HEADER } from '@app/web/proxy';
import { getStoreAvailability } from '@/features/storefront/availability';
import { brandStyles } from '@/features/storefront/branding';
import { StorefrontView } from '@/features/storefront/components/storefront-view';
import {
  serializeJsonLd,
  storefrontDescription,
  storefrontJsonLd,
  storefrontPath,
} from '@/features/storefront/seo';
import { siteUrl } from '@/server/env';
import { getStorefront } from '@/server/storefront-api';

interface RestaurantPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

async function loadStorefront(params: RestaurantPageProps['params']) {
  const { restaurantSlug } = await params;
  const normalized = restaurantSlug.toLowerCase();
  if (normalized !== restaurantSlug) {
    permanentRedirect(storefrontPath(encodeURIComponent(normalized)));
  }
  const storefront = await getStorefront(restaurantSlug);
  if (!storefront) {
    notFound();
  }
  return storefront;
}

export async function generateMetadata({ params }: RestaurantPageProps): Promise<Metadata> {
  const storefront = await loadStorefront(params);
  const url = `${siteUrl()}${storefrontPath(storefront.slug)}`;
  const title = `${storefront.name} · Order online`;
  const description = storefrontDescription(storefront);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: storefront.name,
      ...(storefront.logoUrl ? { images: [{ url: storefront.logoUrl }] } : {}),
    },
    twitter: { card: 'summary', title, description },
    robots: { index: true, follow: true },
  };
}

export default async function RestaurantPage({ params }: RestaurantPageProps) {
  const storefront = await loadStorefront(params);
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  const brand = brandStyles(storefront.primaryColor);
  const url = `${siteUrl()}${storefrontPath(storefront.slug)}`;

  return (
    <>
      {brand ? <style nonce={nonce}>{brand}</style> : null}
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(storefrontJsonLd(storefront, url)) }}
      />
      <StorefrontView
        storefront={storefront}
        availability={getStoreAvailability(storefront, new Date())}
      />
    </>
  );
}
