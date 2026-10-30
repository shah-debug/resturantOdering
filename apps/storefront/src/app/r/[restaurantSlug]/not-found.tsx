import type { Metadata } from 'next';
import { Store } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Restaurant not available',
};

export default function RestaurantNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <Store className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold tracking-tight">
        This restaurant isn&apos;t available
      </h1>
      <p className="text-muted-foreground">
        The link may be mistyped, or this restaurant isn&apos;t taking online orders here right now.
        Please check the address with the restaurant.
      </p>
    </main>
  );
}
