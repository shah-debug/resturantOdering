'use client';

import { formatRupees } from '@app/contracts';
import { Badge, Button, Skeleton } from '@app/web/ui';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { ErrorState } from '@/components/states';
import { useGetPlatformHealthQuery, useGetSubscriptionOverviewQuery } from '../platform-api';
import { PlansSection } from './plans-section';

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-xl border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

const number = (value: number) => new Intl.NumberFormat('en-PK').format(value);

export function PlatformOverviewPage() {
  const health = useGetPlatformHealthQuery();
  const overview = useGetSubscriptionOverviewQuery();

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void health.refetch()}
          disabled={health.isFetching}
        >
          <RefreshCw aria-hidden="true" />
          Refresh health
        </Button>
      </div>

      <section aria-labelledby="health-heading" className="grid gap-3">
        <h2 id="health-heading" className="text-lg font-semibold">
          Operational health
        </h2>
        {health.isLoading ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : health.data ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              Database
              <Badge variant={health.data.database.status === 'up' ? 'success' : 'destructive'}>
                {health.data.database.status === 'up' ? 'Up' : 'Down'}
              </Badge>
              <span className="text-muted-foreground">
                {health.data.database.latencyMs} ms · API up for{' '}
                {Math.floor(health.data.uptimeSeconds / 3600)} h · checked{' '}
                {new Date(health.data.checkedAt).toLocaleTimeString('en-PK')}
              </span>
            </p>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile
                label="Orders in the last hour"
                value={number(health.data.orders.placedLastHour)}
              />
              <Tile
                label="New orders waiting over 15 min"
                value={number(health.data.orders.pendingOlderThan15Minutes)}
                note="Not yet accepted or rejected by the restaurant."
              />
              <Tile
                label="Emails waiting to send"
                value={number(health.data.notifications.pending)}
                note={
                  health.data.notifications.oldestPendingMinutes !== null
                    ? `Oldest waiting ${health.data.notifications.oldestPendingMinutes} min`
                    : 'Queue is empty.'
                }
              />
              <Tile
                label="Emails failed (24 h)"
                value={number(health.data.notifications.failedLast24Hours)}
              />
              <Tile
                label="Live dashboard connections"
                value={number(health.data.liveConnections)}
                note="On this API instance."
              />
              <Tile label="Active restaurants" value={number(health.data.restaurants.ACTIVE)} />
              <Tile
                label="Suspended restaurants"
                value={number(health.data.restaurants.SUSPENDED)}
              />
              <Tile label="Closed restaurants" value={number(health.data.restaurants.CLOSED)} />
            </dl>
          </>
        ) : (
          <ErrorState
            error={health.error}
            onRetry={() => void health.refetch()}
            retrying={health.isFetching}
          />
        )}
      </section>

      <section aria-labelledby="subscriptions-heading" className="grid gap-3">
        <h2 id="subscriptions-heading" className="text-lg font-semibold">
          Subscriptions
        </h2>
        {overview.isLoading ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : overview.data ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Active" value={number(overview.data.byStatus.ACTIVE)} />
              <Tile
                label="Trialing"
                value={number(overview.data.byStatus.TRIALING)}
                note={`${overview.data.trialsEndingIn7Days} trials end within 7 days`}
              />
              <Tile label="Past due" value={number(overview.data.byStatus.PAST_DUE)} />
              <Tile
                label="Monthly list price of active plans"
                value={formatRupees(overview.data.monthlyRecurringListPriceMinor)}
                note="Plan prices at sign-up, yearly plans divided by 12. Not collected revenue."
              />
            </dl>
            <p className="text-sm text-muted-foreground">
              {overview.data.restaurantsWithoutSubscription} open restaurant
              {overview.data.restaurantsWithoutSubscription === 1 ? ' has' : 's have'} no current
              plan.
            </p>
            {overview.data.pastDue.length > 0 ? (
              <ul className="grid gap-2 text-sm">
                {overview.data.pastDue.map((entry) => (
                  <li key={entry.organizationId}>
                    <Link
                      className="underline underline-offset-4"
                      href={`/platform/restaurants/${entry.organizationId}`}
                    >
                      {entry.organizationName}
                    </Link>{' '}
                    · {entry.planName} · period ended {entry.currentPeriodEnd.slice(0, 10)}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <ErrorState
            error={overview.error}
            onRetry={() => void overview.refetch()}
            retrying={overview.isFetching}
          />
        )}
      </section>

      <PlansSection />
    </div>
  );
}
