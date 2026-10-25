'use client';

import { UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { type Crumb, TopBar } from './top-bar';

export function AccountShell({
  breadcrumbs = [],
  children,
}: {
  breadcrumbs?: readonly Crumb[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        leading={
          <Link
            href="/"
            aria-label="Restaurant Dashboard home"
            className="mr-2 flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UtensilsCrossed className="size-4" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">Restaurant Dashboard</span>
          </Link>
        }
        breadcrumbs={breadcrumbs}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
