'use client';

import { Badge, Button, Field, Input, Select, Skeleton } from '@app/web/ui';
import { Building2, Download } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/states';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { restaurantsExportUrl, useListPlatformRestaurantsQuery } from '../platform-api';
import { usePlatformRole } from './platform-shell';

type StatusFilter = '' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
const PAGE_SIZE = 20;

export function statusBadge(status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED') {
  return (
    <Badge
      variant={status === 'ACTIVE' ? 'success' : status === 'SUSPENDED' ? 'warning' : 'secondary'}
    >
      {status === 'ACTIVE' ? 'Active' : status === 'SUSPENDED' ? 'Suspended' : 'Closed'}
    </Badge>
  );
}

export function RestaurantsPage() {
  const role = usePlatformRole();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search.trim(), 300);
  const restaurants = useListPlatformRestaurantsQuery({
    search: debounced || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const totalPages = restaurants.data
    ? Math.max(1, Math.ceil(restaurants.data.total / PAGE_SIZE))
    : 1;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Restaurants</h1>
        {role === 'SUPER_ADMIN' ? (
          <Button asChild variant="outline">
            <a
              href={restaurantsExportUrl({
                search: debounced || undefined,
                status: status || undefined,
              })}
              download
            >
              <Download aria-hidden="true" />
              Export CSV
            </a>
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Search">
          {(control) => (
            <Input
              {...control}
              type="search"
              placeholder="Name, web address or owner email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          )}
        </Field>
        <Field label="Status">
          {(control) => (
            <Select
              {...control}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="CLOSED">Closed</option>
            </Select>
          )}
        </Field>
      </div>
      {restaurants.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : restaurants.error && !restaurants.data ? (
        <ErrorState
          error={restaurants.error}
          onRetry={() => void restaurants.refetch()}
          retrying={restaurants.isFetching}
        />
      ) : restaurants.data?.items.length === 0 ? (
        <EmptyState icon={Building2} title="No restaurants found" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Restaurants on the platform</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-medium">
                  Restaurant
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Owner
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Plan
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Orders (30 days)
                </th>
              </tr>
            </thead>
            <tbody>
              {restaurants.data?.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/restaurants/${item.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {item.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      /{item.slug} · {item.branchCount} branch{item.branchCount === 1 ? '' : 'es'}
                      {item.onboardingCompletedAt ? '' : ' · setup not finished'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{statusBadge(item.status)}</td>
                  <td className="px-4 py-3">{item.owner?.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    {item.subscription
                      ? `${item.subscription.planName} (${item.subscription.status.toLowerCase()})`
                      : 'No plan'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.ordersLast30Days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {restaurants.data && restaurants.data.total > PAGE_SIZE ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
