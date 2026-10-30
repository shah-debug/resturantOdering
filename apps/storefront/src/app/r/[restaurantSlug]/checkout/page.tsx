import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckoutView } from '@/features/checkout/components/checkout-view';
import { getStoreAvailability } from '@/features/storefront/availability';
import { brandStyles } from '@/features/storefront/branding';
import { NONCE_HEADER } from '@app/web/proxy';
import { headers } from 'next/headers';
import { getStorefront } from '@/server/storefront-api';

interface CheckoutPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export async function generateMetadata({ params }: CheckoutPageProps): Promise<Metadata> {
  const storefront = await getStorefront((await params).restaurantSlug);
  return {
    title: { absolute: storefront ? `Checkout · ${storefront.name}` : 'Checkout' },
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const storefront = await getStorefront((await params).restaurantSlug);
  if (!storefront) {
    notFound();
  }
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  const brand = brandStyles(storefront.primaryColor);
  return (
    <div data-storefront className="min-h-dvh bg-background">
      {brand ? <style nonce={nonce}>{brand}</style> : null}
      <div className="h-2 bg-primary" aria-hidden="true" />
      <CheckoutView
        storefront={storefront}
        availability={getStoreAvailability(storefront, new Date())}
      />
    </div>
  );
}
