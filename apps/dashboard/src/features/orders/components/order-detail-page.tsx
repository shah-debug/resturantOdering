'use client';

import { formatRupees, type OrderDetail } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import { Alert, Badge, Button, Field, Select } from '@app/web/ui';
import { ArrowLeft, Phone, Printer } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  ErrorState,
  isUnavailableError,
  LoadingState,
  UnavailableState,
} from '@/components/states';
import { useListRidersQuery } from '@/features/riders/riders-api';
import { useFallbackPolling } from '../live-orders';
import { formatDateTime, STATUS_LABELS, statusVariant } from '../order-labels';
import { useAssignRiderMutation, useGetOrderQuery } from '../orders-api';
import { TransitionControls } from './transition-controls';

function RiderAssignment({
  organizationId,
  order,
}: {
  organizationId: string;
  order: OrderDetail;
}) {
  const riders = useListRidersQuery({ organizationId, branchId: order.branchId, status: 'ACTIVE' });
  const [assign, state] = useAssignRiderMutation();
  const [error, setError] = useState<string | null>(null);
  const eligible = (riders.data ?? []).filter(
    (rider) => rider.branchId === null || rider.branchId === order.branchId,
  );

  async function choose(riderId: string) {
    setError(null);
    try {
      await assign({
        organizationId,
        orderId: order.id,
        body: { riderId: riderId || null, expectedRiderId: order.rider?.id ?? null },
      }).unwrap();
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  return (
    <div className="grid gap-2">
      <Field
        label="Rider"
        hint={
          eligible.length === 0 && riders.data
            ? 'No active riders for this branch yet. Add one on the Riders page.'
            : undefined
        }
      >
        {(control) => (
          <Select
            {...control}
            value={order.rider?.id ?? ''}
            disabled={state.isLoading || riders.isLoading}
            onChange={(event) => void choose(event.target.value)}
          >
            <option value="">No rider assigned</option>
            {eligible.map((rider) => (
              <option key={rider.id} value={rider.id}>
                {rider.fullName}
                {rider.availability === 'ON_DELIVERY'
                  ? ` (on ${rider.activeDeliveries} deliver${rider.activeDeliveries === 1 ? 'y' : 'ies'})`
                  : rider.availability === 'OFFLINE'
                    ? ' (offline)'
                    : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

export function OrderDetailPage({
  organizationId,
  orderId,
}: {
  organizationId: string;
  orderId: string;
}) {
  const pollingInterval = useFallbackPolling();
  const query = useGetOrderQuery({ organizationId, orderId }, { pollingInterval });
  const base = `/organizations/${encodeURIComponent(organizationId)}/orders`;

  if (query.isLoading) {
    return <LoadingState label="Loading order…" />;
  }
  if (isUnavailableError(query.error)) {
    return <UnavailableState error={query.error} />;
  }
  if (!query.data) {
    return (
      <ErrorState
        title="We couldn't load this order"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const order = query.data;
  const isDelivery = order.type === 'DELIVERY';

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link
          href={base}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All orders
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Order #{order.orderNumber}</h1>
          <Badge variant={statusVariant(order.status)}>{STATUS_LABELS[order.status]}</Badge>
          <Badge variant="outline">{isDelivery ? 'Delivery' : 'Pickup'}</Badge>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href={`${base}/${order.id}/receipt`}>
              <Printer aria-hidden="true" />
              Print receipt
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Placed {formatDateTime(order.placedAt)} · {order.branchName}
        </p>
      </div>

      {order.cancellationReason ? (
        <Alert variant="destructive" title={`${STATUS_LABELS[order.status]}: reason`}>
          {order.cancellationReason}
        </Alert>
      ) : null}

      <section aria-label="Actions" className="grid gap-4 rounded-xl border bg-card p-4">
        <TransitionControls
          organizationId={organizationId}
          orderId={order.id}
          orderNumber={order.orderNumber}
          status={order.status}
          transitions={order.availableTransitions}
        />
        {isDelivery && order.status === 'READY' && !order.rider && order.canAssignRider ? (
          <p className="text-sm text-muted-foreground">Assign a rider to send this order out.</p>
        ) : null}
        {order.canAssignRider ? (
          <RiderAssignment organizationId={organizationId} order={order} />
        ) : order.rider ? (
          <p className="text-sm">
            Rider: <span className="font-medium">{order.rider.fullName}</span> ·{' '}
            <a className="underline underline-offset-4" href={`tel:${order.rider.phone}`}>
              {order.rider.phone}
            </a>
          </p>
        ) : null}
        {order.availableTransitions.length === 0 && !order.canAssignRider ? (
          <p className="text-sm text-muted-foreground">
            No actions available for you on this order.
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="items-heading"
          className="grid content-start gap-3 rounded-xl border bg-card p-4"
        >
          <h2 id="items-heading" className="font-semibold">
            Items
          </h2>
          <ul className="grid gap-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {item.quantity} × {item.productName}{' '}
                    <span className="font-normal text-muted-foreground">({item.variantName})</span>
                  </p>
                  {item.addOns.length > 0 ? (
                    <ul className="text-muted-foreground">
                      {item.addOns.map((addOn) => (
                        <li key={`${addOn.groupName}-${addOn.name}`}>
                          + {addOn.groupName}: {addOn.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {item.note ? <p className="text-muted-foreground">Note: {item.note}</p> : null}
                </div>
                <span className="shrink-0 tabular-nums">
                  {formatRupees(item.lineSubtotalMinor)}
                </span>
              </li>
            ))}
          </ul>
          {order.customerNote ? (
            <p className="rounded-lg bg-warning/15 p-3 text-sm">
              <span className="font-medium">Customer note:</span> {order.customerNote}
            </p>
          ) : null}
          <dl className="grid gap-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatRupees(order.totals.subtotalMinor)}</dd>
            </div>
            {order.totals.discountMinor > 0 ? (
              <div className="flex justify-between">
                <dt>Discount{order.promotionCode ? ` (${order.promotionCode})` : ''}</dt>
                <dd className="tabular-nums">−{formatRupees(order.totals.discountMinor)}</dd>
              </div>
            ) : null}
            {isDelivery ? (
              <div className="flex justify-between">
                <dt>Delivery fee</dt>
                <dd className="tabular-nums">
                  {formatRupees(order.totals.deliveryFeeMinor - order.totals.deliveryDiscountMinor)}
                </dd>
              </div>
            ) : null}
            {order.totals.taxMinor > 0 ? (
              <div className="flex justify-between">
                <dt>Tax</dt>
                <dd className="tabular-nums">{formatRupees(order.totals.taxMinor)}</dd>
              </div>
            ) : null}
            {order.totals.roundingAdjustmentMinor !== 0 ? (
              <div className="flex justify-between">
                <dt>Rounding</dt>
                <dd className="tabular-nums">
                  {formatRupees(Math.abs(order.totals.roundingAdjustmentMinor))}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatRupees(order.totals.totalMinor)}</dd>
            </div>
            <p className="text-muted-foreground">
              {order.paymentMethod === 'CASH' ? 'Cash' : order.paymentMethod} ·{' '}
              {order.paymentStatus === 'PAID' ? 'Paid' : 'Not paid yet'}
            </p>
          </dl>
        </section>

        <div className="grid content-start gap-6">
          <section
            aria-labelledby="customer-heading"
            className="grid gap-2 rounded-xl border bg-card p-4 text-sm"
          >
            <h2 id="customer-heading" className="font-semibold">
              Customer
            </h2>
            <p>{order.customerName}</p>
            <a
              href={`tel:${order.customerPhone}`}
              className="inline-flex items-center gap-2 font-medium underline underline-offset-4"
            >
              <Phone className="size-4" aria-hidden="true" />
              {order.customerPhone}
            </a>
            {order.delivery ? (
              <address className="text-muted-foreground not-italic">
                {order.delivery.addressLine}
                {order.delivery.area ? `, ${order.delivery.area}` : ''}, {order.delivery.city}
                {order.delivery.landmark ? (
                  <span className="block">Near {order.delivery.landmark}</span>
                ) : null}
                {order.delivery.instructions ? (
                  <span className="block">Instructions: {order.delivery.instructions}</span>
                ) : null}
                {order.delivery.zoneName ? (
                  <span className="block">Zone: {order.delivery.zoneName}</span>
                ) : null}
              </address>
            ) : (
              <p className="text-muted-foreground">Pickup from {order.branch.name}</p>
            )}
          </section>

          <section
            aria-labelledby="timeline-heading"
            className="grid gap-2 rounded-xl border bg-card p-4 text-sm"
          >
            <h2 id="timeline-heading" className="font-semibold">
              History
            </h2>
            <ol className="grid gap-2">
              {order.timeline.map((entry, index) => (
                <li key={`${entry.toStatus}-${index}`} className="grid">
                  <span className="font-medium">{STATUS_LABELS[entry.toStatus]}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.at)} ·{' '}
                    {entry.actorName ?? (entry.actorType === 'CUSTOMER' ? 'Customer' : 'System')}
                  </span>
                  {entry.note ? <span className="text-xs">“{entry.note}”</span> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
