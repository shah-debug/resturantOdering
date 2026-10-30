import type { Metadata } from 'next';
import { ReceiptText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Order not found',
  referrer: 'no-referrer',
};

export default function OrderNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <ReceiptText className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find this order</h1>
      <p className="text-muted-foreground">
        Please open the full tracking link from your order confirmation, or contact the restaurant.
      </p>
    </main>
  );
}
