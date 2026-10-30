'use client';

import {
  formatRupees,
  ORDER_VIEW_LABELS,
  ORDER_VIEWS,
  type OrderListItem,
  type OrderType,
  type OrderView,
} from '@app/contracts';
import { Badge, Button, Field, Input, Select, Skeleton } from '@app/web/ui';
import { Bike, ChefHat, Inbox, Search, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, isUnavailableError, UnavailableState } from '@/components/states';
import { useListBranchesQuery } from '@/features/restaurant/restaurant-api';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useFallbackPolling } from '../live-orders';
import { formatAge, STATUS_LABELS, statusVariant } from '../order-labels';
import { useGetOrderCountsQuery, useListOrdersQuery } from '../orders-api';
import { TransitionControls } from './transition-controls';

export const ORDERS_PAGE_SIZE = 20;

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function OrderRow({
  organizationId,
  order,
  now,
}: {
  organizationId: string;
  order: OrderListItem;
  now: number;
}) {
  const href = `/organizations/${encodeURIComponent(organizationId)}/orders/${order.id}`;
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href} className="font-semibold underline-offset-4 hover:underline">
            Order #{order.orderNumber}
          </Link>
          <Badge variant={statusVariant(order.status)}>{STATUS_LABELS[order.status]}</Badge>
          <Badge variant="outline">
            {order.type === 'DELIVERY' ? (
              <Bike aria-hidden="true" />
            ) : (
              <ShoppingBag aria-hidden="true" />
            )}
            {order.type === 'DELIVERY' ? 'Delivery' : 'Pickup'}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatAge(order.placedAt, now)}</span>
        </div>
        <p className="truncate text-sm">
          {order.customerName} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'} ·{' '}
          <span className="font-medium tabular-nums">{formatRupees(order.totalMinor)}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {order.branchName}
          {order.deliveryArea ? ` · ${order.deliveryArea}` : ''}
          {order.rider ? ` · Rider: ${order.rider.fullName}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <TransitionControls
          organizationId={organizationId}
          orderId={order.id}
          orderNumber={order.orderNumber}
          status={order.status}
          transitions={order.availableTransitions}
          size="sm"
          only="quick"
        />
        <Button asChild variant="outline" size="sm">
          <Link href={href}>Details</Link>
        </Button>
      </div>
    </li>
  );
}

export function OrdersPage({ organizationId }: { organizationId: string }) {
  const [view, setView] = useState<OrderView>('new');
  const [type, setType] = useState<OrderType | ''>('');
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const pollingInterval = useFallbackPolling();
  const now = useNow();

  const branches = useListBranchesQuery(organizationId);
  const branchList = branches.data ?? [];
  const counts = useGetOrderCountsQuery(
    { organizationId, branchId: branchId || undefined },
    { pollingInterval },
  );
  const orders = useListOrdersQuery(
    {
      organizationId,
      view,
      type: type || undefined,
      branchId: branchId || undefined,
      search: debouncedSearch || undefined,
      page,
      pageSize: ORDERS_PAGE_SIZE,
    },
    { pollingInterval },
  );

  if (isUnavailableError(orders.error)) {
    return <UnavailableState error={orders.error} />;
  }

  const totalPages = orders.data
    ? Math.max(1, Math.ceil(orders.data.total / orders.data.pageSize))
    : 1;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">New orders appear here automatically.</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`${base}/kitchen`}>
            <ChefHat aria-hidden="true" />
            Kitchen view
          </Link>
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Order status"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {ORDER_VIEWS.map((option) => {
          const selected = option === view;
          const count = counts.data?.[option];
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setView(option);
                setPage(1);
              }}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >
              {ORDER_VIEW_LABELS[option]}
              {count !== undefined ? (
                <span className="rounded-full bg-background/20 px-1.5 text-xs tabular-nums">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_12rem]">
        <Field label="Search">
          {(control) => (
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                {...control}
                type="search"
                className="pl-9"
                placeholder="Order #, name or phone"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
        </Field>
        <Field label="Type">
          {(control) => (
            <Select
              {...control}
              value={type}
              onChange={(event) => {
                setType(event.target.value as OrderType | '');
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="DELIVERY">Delivery</option>
              <option value="PICKUP">Pickup</option>
            </Select>
          )}
        </Field>
        {branchList.length > 1 ? (
          <Field label="Branch">
            {(control) => (
              <Select
                {...control}
                value={branchId}
                onChange={(event) => {
                  setBranchId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All branches</option>
                {branchList.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>

      <section
        role="tabpanel"
        aria-label={`${ORDER_VIEW_LABELS[view]} orders`}
        aria-busy={orders.isFetching}
      >
        {orders.isLoading ? (
          <div className="grid gap-3" role="status">
            <span className="sr-only">Loading orders…</span>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : orders.error && !orders.data ? (
          <ErrorState
            title="We couldn't load orders"
            error={orders.error}
            onRetry={() => void orders.refetch()}
            retrying={orders.isFetching}
          />
        ) : orders.data && orders.data.items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={
              debouncedSearch
                ? 'No orders match your search'
                : `No ${ORDER_VIEW_LABELS[view].toLowerCase()} orders`
            }
            description={
              view === 'new'
                ? 'New orders will appear here as soon as customers place them.'
                : undefined
            }
          />
        ) : (
          <ul className="grid gap-3">
            {orders.data?.items.map((order) => (
              <OrderRow key={order.id} organizationId={organizationId} order={order} now={now} />
            ))}
          </ul>
        )}
      </section>

      {orders.data && orders.data.total > orders.data.pageSize ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
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
