import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { NONCE_HEADER } from '@app/web/proxy';
import { OrderTrackingView } from '@/features/orders/components/order-tracking-view';
import { brandStyles } from '@/features/storefront/branding';
import { getOrderTracking, getStorefront } from '@/server/storefront-api';

interface OrderPageProps {
  params: Promise<{ restaurantSlug: string; orderId: string }>;
  searchParams: Promise<{ token?: string | string[]; placed?: string | string[] }>;
}

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const { restaurantSlug, orderId } = await params;
  const query = await searchParams;
  const token = single(query.token);
  const order = await getOrderTracking(restaurantSlug, orderId, token);
  if (!order) {
    notFound();
  }
  const storefront = await getStorefront(restaurantSlug);
  const brand = brandStyles(storefront?.primaryColor ?? null);
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return (
    <div data-storefront className="min-h-dvh bg-background">
      {brand ? <style nonce={nonce}>{brand}</style> : null}
      <div className="h-2 bg-primary" aria-hidden="true" />
      <OrderTrackingView order={order} token={token} justPlaced={single(query.placed) === '1'} />
    </div>
  );
}
