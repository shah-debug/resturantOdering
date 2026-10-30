'use client';

import { formatRupees } from '@app/contracts';
import { Button } from '@app/web/ui';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import {
  ErrorState,
  isUnavailableError,
  LoadingState,
  UnavailableState,
} from '@/components/states';
import { formatDateTime } from '../order-labels';
import { useGetOrderQuery } from '../orders-api';

export function ReceiptPage({
  organizationId,
  orderId,
}: {
  organizationId: string;
  orderId: string;
}) {
  const query = useGetOrderQuery({ organizationId, orderId });
  if (query.isLoading) {
    return <LoadingState label="Loading receipt…" />;
  }
  if (isUnavailableError(query.error)) {
    return <UnavailableState error={query.error} />;
  }
  if (!query.data) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const order = query.data;
  const isDelivery = order.type === 'DELIVERY';
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-2 ${strong ? 'text-base font-bold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/organizations/${encodeURIComponent(organizationId)}/orders/${order.id}`}>
            <ArrowLeft aria-hidden="true" />
            Back to order
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          Print
        </Button>
      </div>

      <article
        aria-label={`Receipt for order #${order.orderNumber}`}
        className="mx-auto w-full max-w-[80mm] bg-white p-4 font-mono text-[13px] leading-snug text-black print:max-w-none print:p-0"
      >
        <header className="border-b border-dashed border-black pb-2 text-center">
          <p className="text-base font-bold">{order.restaurantName}</p>
          <p>{order.branch.name}</p>
          <p>
            {order.branch.addressLine}, {order.branch.city}
          </p>
          {order.branch.phone ? <p>{order.branch.phone}</p> : null}
        </header>
        <section className="border-b border-dashed border-black py-2">
          <p className="text-lg font-bold">
            #{order.orderNumber} · {isDelivery ? 'DELIVERY' : 'PICKUP'}
          </p>
          <p>{formatDateTime(order.placedAt)}</p>
          <p>
            {order.customerName} · {order.customerPhone}
          </p>
          {order.delivery ? (
            <p>
              {order.delivery.addressLine}
              {order.delivery.area ? `, ${order.delivery.area}` : ''}, {order.delivery.city}
              {order.delivery.landmark ? ` (near ${order.delivery.landmark})` : ''}
            </p>
          ) : null}
          {order.delivery?.instructions ? <p>Instructions: {order.delivery.instructions}</p> : null}
          {order.rider ? <p>Rider: {order.rider.fullName}</p> : null}
        </section>
        <section className="border-b border-dashed border-black py-2">
          {order.items.map((item) => (
            <div key={item.id} className="py-0.5">
              {row(
                `${item.quantity} x ${item.productName} (${item.variantName})`,
                formatRupees(item.lineSubtotalMinor),
              )}
              {item.addOns.map((addOn) => (
                <p key={`${addOn.groupName}-${addOn.name}`} className="pl-3">
                  + {addOn.name}
                </p>
              ))}
            </div>
          ))}
          {order.customerNote ? <p className="pt-1 font-bold">NOTE: {order.customerNote}</p> : null}
        </section>
        <section className="grid gap-0.5 py-2">
          {row('Subtotal', formatRupees(order.totals.subtotalMinor))}
          {order.totals.discountMinor > 0
            ? row('Discount', `-${formatRupees(order.totals.discountMinor)}`)
            : null}
          {isDelivery
            ? row(
                'Delivery',
                formatRupees(order.totals.deliveryFeeMinor - order.totals.deliveryDiscountMinor),
              )
            : null}
          {order.totals.taxMinor > 0 ? row('Tax', formatRupees(order.totals.taxMinor)) : null}
          {order.totals.roundingAdjustmentMinor !== 0
            ? row('Rounding', formatRupees(Math.abs(order.totals.roundingAdjustmentMinor)))
            : null}
          {row('TOTAL', formatRupees(order.totals.totalMinor), true)}
          <p className="pt-1 text-center">
            {order.paymentMethod === 'CASH' ? 'Cash' : order.paymentMethod} ·{' '}
            {order.paymentStatus === 'PAID' ? 'PAID' : 'TO BE COLLECTED'}
          </p>
        </section>
      </article>
    </div>
  );
}
