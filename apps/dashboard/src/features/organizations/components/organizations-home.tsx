'use client';

import { ChevronRight, Plus, Store } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { MeResponse } from '@app/contracts';
import { Button, Card } from '@app/web/ui';
import { EmptyState, LoadingState } from '@/components/states';
import { RestaurantMark } from '@/components/shell/restaurant-mark';
import { useMeQuery } from '@/features/auth/auth-api';
import { ROLE_LABELS } from '../roles';

export function homeDestination(memberships: MeResponse['memberships']): string | null {
  if (memberships.length === 0) {
    return '/onboarding';
  }
  if (memberships.length === 1 && memberships[0]) {
    return `/organizations/${encodeURIComponent(memberships[0].organizationId)}`;
  }
  return null;
}

export function OrganizationsHome() {
  const router = useRouter();
  const { data: me } = useMeQuery();
  const destination = me ? homeDestination(me.memberships) : null;

  useEffect(() => {
    if (destination) {
      router.replace(destination);
    }
  }, [destination, router]);

  if (!me || destination) {
    return <LoadingState label="Opening your restaurant…" rows={1} />;
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Choose a restaurant</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re a member of {me.memberships.length} restaurants.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/onboarding">
            <Plus aria-hidden="true" />
            Add a restaurant
          </Link>
        </Button>
      </header>
      {me.memberships.length === 0 ? (
        <EmptyState icon={Store} title="No restaurants yet" />
      ) : (
        <Card>
          <ul className="divide-y" aria-label="Your restaurants">
            {me.memberships.map((membership) => (
              <li key={membership.membershipId}>
                <Link
                  href={`/organizations/${encodeURIComponent(membership.organizationId)}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:px-6"
                >
                  <RestaurantMark name={membership.organizationName} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{membership.organizationName}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {ROLE_LABELS[membership.role]} · {membership.organizationSlug}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
