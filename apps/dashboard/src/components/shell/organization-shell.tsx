'use client';

import { LayoutDashboard, ListChecks, Settings, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Skeleton } from '@app/web/ui';
import { ErrorState, isUnavailableError, LoadingState, UnavailableState } from '@/components/states';
import { useGetOrganizationQuery } from '@/features/organizations/organizations-api';
import { canManageRestaurant, canManageTeam } from '@/features/organizations/roles';
import { useGetOnboardingStatusQuery } from '@/features/restaurant/restaurant-api';
import { setupProgress } from '@/features/restaurant/steps';
import type { NavItem } from './main-nav';
import { MainNav } from './main-nav';
import { MobileNav } from './mobile-nav';
import { OrganizationSwitcher } from './organization-switcher';
import { RestaurantMark } from './restaurant-mark';
import { useSession } from './session';
import { type Crumb, TopBar } from './top-bar';

const SECTION_LABELS: Record<string, string> = {
  onboarding: 'Setup',
  members: 'Team',
  settings: 'Settings',
};

export function organizationBreadcrumbs(
  pathname: string,
  organizationId: string,
  organizationName: string,
): Crumb[] {
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const section = pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1).split('/')[0]
    : undefined;
  const sectionLabel = section ? SECTION_LABELS[section] : undefined;
  return [{ label: organizationName, href: base }, { label: sectionLabel ?? 'Overview' }];
}

export function OrganizationShell({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { me } = useSession();
  const organization = useGetOrganizationQuery(organizationId);
  const onboarding = useGetOnboardingStatusQuery(organizationId, {
    skip: !organization.data,
  });
  const membership = me.memberships.find((entry) => entry.organizationId === organizationId);
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const name = organization.data?.name ?? membership?.organizationName ?? 'Restaurant';
  const logoUrl = organization.data?.logoUrl ?? null;

  const progress = onboarding.data ? setupProgress(onboarding.data) : null;
  const setupBadge =
    onboarding.data && !onboarding.data.completedAt && progress
      ? {
          text: `${progress.complete}/${progress.total}`,
          label: `${progress.complete} of ${progress.total} steps complete`,
        }
      : undefined;

  const items: NavItem[] = [
    { href: base, label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: `${base}/onboarding`, label: 'Setup', icon: ListChecks, badge: setupBadge },
    ...(canManageTeam(membership?.role)
      ? [{ href: `${base}/members`, label: 'Team', icon: Users }]
      : []),
    ...(canManageRestaurant(membership?.role)
      ? [{ href: `${base}/settings`, label: 'Settings', icon: Settings }]
      : []),
  ];

  let content: ReactNode = children;
  if (organization.isLoading) {
    content = <LoadingState label="Loading restaurant…" />;
  } else if (isUnavailableError(organization.error)) {
    content = <UnavailableState error={organization.error} />;
  } else if (!organization.data) {
    content = (
      <ErrorState
        title="We couldn't load this restaurant"
        error={organization.error}
        onRetry={() => void organization.refetch()}
        retrying={organization.isFetching}
      />
    );
  }

  const showNav = Boolean(organization.data);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <aside className="hidden border-r bg-card md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          {organization.isLoading ? (
            <>
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </>
          ) : (
            <>
              <RestaurantMark name={name} logoUrl={logoUrl} />
              <span className="truncate text-sm font-semibold">{name}</span>
            </>
          )}
        </div>
        {showNav ? (
          <div className="flex-1 overflow-y-auto p-3">
            <MainNav items={items} />
          </div>
        ) : null}
      </aside>
      <div className="flex min-w-0 flex-col">
        <TopBar
          leading={
            showNav ? <MobileNav items={items} restaurantName={name} logoUrl={logoUrl} /> : null
          }
          breadcrumbs={
            showNav ? organizationBreadcrumbs(pathname, organizationId, name) : [{ label: name }]
          }
          actions={
            <OrganizationSwitcher
              memberships={me.memberships}
              currentOrganizationId={organizationId}
            />
          }
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8"
        >
          {content}
        </main>
      </div>
    </div>
  );
}
