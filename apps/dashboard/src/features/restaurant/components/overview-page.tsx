'use client';

import { ArrowRight, Clock, MapPin, ShoppingBag, Truck } from 'lucide-react';
import Link from 'next/link';
import type { Branch, Organization } from '@app/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Skeleton,
} from '@app/web/ui';
import {
  EmptyState,
  ErrorState,
  isUnavailableError,
  LoadingState,
  UnavailableState,
} from '@/components/states';
import { RestaurantMark } from '@/components/shell/restaurant-mark';
import { useMeQuery } from '@/features/auth/auth-api';
import { useGetOrganizationQuery } from '@/features/organizations/organizations-api';
import { canManageRestaurant } from '@/features/organizations/roles';
import { dayOfWeekIn, describeDay } from '../hours';
import { formatRupees } from '../money';
import { useGetOnboardingStatusQuery, useListBranchesQuery } from '../restaurant-api';
import { setupProgress, stepHref } from '../steps';
import { ReadinessList } from './readiness-list';
import { formatAddress } from './storefront-preview';

function ProfileSummary({
  organization,
  canEdit,
}: {
  organization: Organization;
  canEdit: boolean;
}) {
  const settingsHref = `/organizations/${encodeURIComponent(organization.id)}/settings`;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle className="text-base">Restaurant profile</CardTitle>
          <CardDescription>What customers see about you.</CardDescription>
        </div>
        {canEdit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`${settingsHref}#profile`}>Edit</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-3">
          <RestaurantMark
            name={organization.name}
            logoUrl={organization.logoUrl}
            className="size-12 rounded-xl"
          />
          <div className="grid min-w-0">
            <p className="truncate font-medium">{organization.name}</p>
            <p className="truncate text-sm text-muted-foreground">{organization.slug}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {organization.description ?? 'No description yet.'}
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">Contact phone</dt>
            <dd className="font-medium break-all">{organization.contactPhone ?? 'Not set'}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">Time zone</dt>
            <dd className="font-medium">{organization.timezone.replace(/_/g, ' ')}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function BranchSummary({ branch, timeZone }: { branch: Branch; timeZone: string }) {
  return (
    <li className="grid gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{branch.name}</p>
        <Badge variant={branch.isAcceptingOrders ? 'success' : 'secondary'}>
          {branch.isAcceptingOrders ? 'Accepting orders' : 'Not accepting orders yet'}
        </Badge>
      </div>
      <dl className="grid gap-2 text-sm">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Address</dt>
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dd>{formatAddress(branch)}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="sr-only">Hours today</dt>
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dd>Today: {describeDay(branch.openingHours, dayOfWeekIn(timeZone))}</dd>
        </div>
      </dl>
      <ul className="flex flex-wrap gap-2" aria-label={`Ordering options for ${branch.name}`}>
        <li>
          <Badge variant={branch.deliveryEnabled ? 'secondary' : 'outline'}>
            <Truck aria-hidden="true" />
            {branch.deliveryEnabled
              ? `Delivery${branch.delivery ? ` · ${formatRupees(branch.delivery.feeMinor)}` : ''}`
              : 'No delivery'}
          </Badge>
        </li>
        <li>
          <Badge variant={branch.pickupEnabled ? 'secondary' : 'outline'}>
            <ShoppingBag aria-hidden="true" />
            {branch.pickupEnabled ? 'Pickup' : 'No pickup'}
          </Badge>
        </li>
      </ul>
    </li>
  );
}

function BranchesCard({ organization, canEdit }: { organization: Organization; canEdit: boolean }) {
  const { data, error, isLoading, isFetching, refetch } = useListBranchesQuery(organization.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Locations</CardTitle>
        <CardDescription>Address, today&apos;s hours and how customers order.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div role="status" aria-live="polite" className="grid gap-2">
            <span className="sr-only">Loading locations…</span>
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : error || !data ? (
          <ErrorState
            title="We couldn't load your locations"
            error={error}
            onRetry={() => void refetch()}
            retrying={isFetching}
            className="py-6"
          />
        ) : data.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No location yet"
            description="Add the address customers order from."
            className="py-6"
            action={
              canEdit ? (
                <Button asChild variant="outline">
                  <Link href={stepHref(organization.id, 'branch')}>Add location</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y">
            {data.map((branch) => (
              <BranchSummary key={branch.id} branch={branch} timeZone={organization.timezone} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SetupCard({ organizationId, canEdit }: { organizationId: string; canEdit: boolean }) {
  const { data, error, isLoading, isFetching, refetch } =
    useGetOnboardingStatusQuery(organizationId);

  if (isLoading) {
    return <LoadingState label="Loading setup status…" rows={2} />;
  }
  if (error || !data) {
    return (
      <ErrorState
        title="We couldn't load your setup status"
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }

  const progress = setupProgress(data);
  const percent = progress.total > 0 ? Math.round((progress.complete / progress.total) * 100) : 0;
  const openItems = data.checks.filter((check) => check.status !== 'complete');

  if (data.completedAt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Readiness</CardTitle>
          <CardDescription>
            {openItems.length > 0
              ? 'Setup is complete. A few things can still make your restaurant better.'
              : 'Setup is complete and everything is in place.'}
          </CardDescription>
        </CardHeader>
        {openItems.length > 0 ? (
          <CardContent>
            <ReadinessList
              organizationId={organizationId}
              checks={data.checks}
              canEdit={canEdit}
              hideComplete
            />
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle>Finish setting up your restaurant</CardTitle>
            <CardDescription>
              Complete the remaining steps so customers can start ordering.
            </CardDescription>
          </div>
          <Button asChild>
            <Link href={`/organizations/${encodeURIComponent(organizationId)}/onboarding`}>
              Continue setup
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-1.5">
          <Progress value={percent} aria-label="Setup progress" />
          <p className="text-sm text-muted-foreground">
            {progress.complete} of {progress.total} steps complete
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <ReadinessList
          organizationId={organizationId}
          checks={data.checks}
          canEdit={canEdit}
          hideComplete
        />
      </CardContent>
    </Card>
  );
}

export function OverviewPage({ organizationId }: { organizationId: string }) {
  const { data: me } = useMeQuery();
  const role = me?.memberships.find((entry) => entry.organizationId === organizationId)?.role;
  const canEdit = canManageRestaurant(role);
  const {
    data: organization,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useGetOrganizationQuery(organizationId);

  if (isLoading) {
    return <LoadingState label="Loading overview…" />;
  }
  if (isUnavailableError(error)) {
    return <UnavailableState error={error} />;
  }
  if (!organization) {
    return (
      <ErrorState
        title="We couldn't load this restaurant"
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{organization.name}</h1>
        <p className="text-sm text-muted-foreground">Overview of your restaurant setup.</p>
      </header>
      <SetupCard organizationId={organizationId} canEdit={canEdit} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileSummary organization={organization} canEdit={canEdit} />
        <BranchesCard organization={organization} canEdit={canEdit} />
      </div>
    </div>
  );
}
