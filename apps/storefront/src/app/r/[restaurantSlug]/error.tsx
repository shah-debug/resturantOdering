'use client';

import { Button } from '@app/web/ui';

export default function RestaurantError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t load this menu</h1>
      <p className="text-muted-foreground">
        Something went wrong on our side. Please try again in a moment.
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
