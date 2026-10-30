'use client';

import { Activity, Building2, ScrollText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/states';
import { MainNav, type NavItem } from '@/components/shell/main-nav';
import { useSession } from '@/components/shell/session';
import { TopBar } from '@/components/shell/top-bar';

const ITEMS: NavItem[] = [
  { href: '/platform', label: 'Overview', icon: Activity, exact: true },
  { href: '/platform/restaurants', label: 'Restaurants', icon: Building2 },
  { href: '/platform/audit', label: 'Audit log', icon: ScrollText },
];

export function usePlatformRole() {
  const { me } = useSession();
  return me.user.platformRole;
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const role = usePlatformRole();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r bg-card md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
          <ShieldCheck className="size-5" aria-hidden="true" />
          Platform admin
        </div>
        {role ? (
          <div className="p-3">
            <MainNav items={ITEMS} />
          </div>
        ) : null}
      </aside>
      <div className="flex min-w-0 flex-col">
        <TopBar
          leading={
            <Link href="/platform" className="font-semibold md:hidden">
              Platform admin
            </Link>
          }
          breadcrumbs={[{ label: 'Restaurants', href: '/' }, { label: 'Platform admin' }]}
        />
        <main
          id="main-content"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        >
          {role ? (
            <>
              <nav
                aria-label="Platform sections"
                className="mb-6 flex gap-2 overflow-x-auto md:hidden"
              >
                {ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full border px-3 py-1.5 text-sm whitespace-nowrap"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              {children}
            </>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="Platform access required"
              description="This area is only for platform administrators and support staff."
            />
          )}
        </main>
      </div>
    </div>
  );
}
