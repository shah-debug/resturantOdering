'use client';

import type { OrderListItem, OrderView } from '@app/contracts';
import { Badge, Skeleton } from '@app/web/ui';
import { ChefHat } from 'lucide-react';
import Link from 'next/link';
import { ErrorState, isUnavailableError, UnavailableState } from '@/components/states';
import { useFallbackPolling } from '../live-orders';
import { formatAge, minutesSince } from '../order-labels';
import { useListOrdersQuery } from '../orders-api';
import { useNow } from './orders-page';
import { TransitionControls } from './transition-controls';

const LATE_AFTER_MINUTES = 20;

function Ticket({
  organizationId,
  order,
  now,
}: {
  organizationId: string;
  order: OrderListItem;
  now: number;
}) {
  const late = minutesSince(order.statusChangedAt, now) >= LATE_AFTER_MINUTES;
  return (
    <li
      className={`grid gap-3 rounded-xl border-2 bg-card p-4 ${late ? 'border-destructive' : 'border-border'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/organizations/${encodeURIComponent(organizationId)}/orders/${order.id}`}
          className="text-2xl font-bold underline-offset-4 hover:underline"
        >
          #{order.orderNumber}
        </Link>
        <div className="grid justify-items-end gap-1 text-right">
          <Badge variant="outline">{order.type === 'DELIVERY' ? 'Delivery' : 'Pickup'}</Badge>
          <span
            className={`text-sm ${late ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
          >
            {formatAge(order.statusChangedAt, now)}
          </span>
        </div>
      </div>
      <ul className="grid gap-2 text-lg">
        {order.lines.map((line, index) => (
          <li key={`${line.productName}-${index}`}>
            <span className="font-semibold">
              {line.quantity} × {line.productName}
            </span>{' '}
            <span className="text-muted-foreground">({line.variantName})</span>
            {line.addOns.length > 0 ? (
              <span className="block text-base text-muted-foreground">
                + {line.addOns.join(', ')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {order.customerNote ? (
        <p className="rounded-lg bg-warning/20 p-2 text-base font-medium">
          Note: {order.customerNote}
        </p>
      ) : null}
      <TransitionControls
        organizationId={organizationId}
        orderId={order.id}
        orderNumber={order.orderNumber}
        status={order.status}
        transitions={order.availableTransitions}
        size="lg"
        only="quick"
      />
    </li>
  );
}

function Column({
  organizationId,
  view,
  title,
  now,
}: {
  organizationId: string;
  view: OrderView;
  title: string;
  now: number;
}) {
  const pollingInterval = useFallbackPolling();
  const orders = useListOrdersQuery(
    { organizationId, view, page: 1, pageSize: 50 },
    { pollingInterval },
  );
  return (
    <section aria-labelledby={`kitchen-${view}`} className="grid content-start gap-3">
      <h2 id={`kitchen-${view}`} className="flex items-center gap-2 text-lg font-semibold">
        {title}
        {orders.data ? <Badge variant="secondary">{orders.data.total}</Badge> : null}
      </h2>
      {orders.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : isUnavailableError(orders.error) ? (
        <UnavailableState error={orders.error} />
      ) : orders.error && !orders.data ? (
        <ErrorState
          error={orders.error}
          onRetry={() => void orders.refetch()}
          retrying={orders.isFetching}
        />
      ) : orders.data?.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing here.
        </p>
      ) : (
        <ul className="grid gap-3">
          {orders.data?.items.map((order) => (
            <Ticket key={order.id} organizationId={organizationId} order={order} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function KitchenPage({ organizationId }: { organizationId: string }) {
  const now = useNow();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ChefHat aria-hidden="true" />
          Kitchen
        </h1>
        <p className="text-sm text-muted-foreground">
          Accepted orders to cook, oldest first. Tickets turn red after {LATE_AFTER_MINUTES}{' '}
          minutes.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Column organizationId={organizationId} view="accepted" title="To start" now={now} />
        <Column organizationId={organizationId} view="preparing" title="Cooking" now={now} />
      </div>
      <p className="text-sm text-muted-foreground">
        Orders marked ready move to the Orders page for pickup or dispatch.
      </p>
    </div>
  );
}
