import { UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-96 bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]"
      />
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-4">
        <Link
          href="/"
          className="flex animate-fade-in items-center gap-2 self-center rounded-md text-lg font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
            <UtensilsCrossed className="size-4" aria-hidden="true" />
          </span>
          Restaurant Dashboard
        </Link>
        {children}
      </main>
    </div>
  );
}
