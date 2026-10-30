'use client';

import { formatRupees, type OrderTracking } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import {
  Alert,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@app/web/ui';
import { Check, Phone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCancelOrderMutation } from '@/features/checkout/checkout-api';
import { PriceBreakdownList } from '@/features/checkout/components/price-breakdown';
import { storefrontPath } from '@/features/storefront/seo';
import { currentStepIndex, isFinished, progressSteps, statusHeadline } from '../order-progress';

const REFRESH_MS = 30_000;

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PK', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));
}

export function OrderTrackingView({
  order,
  token,
  justPlaced,
}: {
  order: OrderTracking;
  token: string;
  justPlaced: boolean;
}) {
  const router = useRouter();
  const [cancelOrder, cancelState] = useCancelOrderMutation();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const finished = isFinished(order.status);

  useEffect(() => {
    if (finished) {
      return;
    }
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [finished, router]);

  async function cancel() {
    setCancelError(null);
    try {
      await cancelOrder({ slug: order.restaurant.slug, orderId: order.orderId, token }).unwrap();
      router.refresh();
    } catch (error) {
      setCancelError(getErrorMessage(error as Parameters<typeof getErrorMessage>[0]));
      router.refresh();
    }
  }

  const headline = statusHeadline(order);
  const steps = progressSteps(order.type);
  const current = currentStepIndex(order.type, order.status);
  const stopped = order.status === 'CANCELLED' || order.status === 'REJECTED';
  const isDelivery = order.type === 'DELIVERY';

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
      {justPlaced ? (
        <Alert variant="success" title="Thank you! Your order has been placed.">
          Save this page to check on your order. Anyone with this link can see it.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {order.restaurant.name} · Order #{order.orderNumber}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{headline.title}</h1>
        <p className="text-muted-foreground">{headline.detail}</p>
        {!stopped && !finished && order.estimatedMinutes ? (
          <p className="text-sm">
            Estimated {isDelivery ? 'delivery' : 'preparation'} time: about {order.estimatedMinutes}{' '}
            minutes
          </p>
        ) : null}
      </div>

      {!stopped ? (
        <ol className="grid gap-3 sm:grid-cols-5" aria-label="Order progress">
          {steps.map((step, index) => {
            const done = index <= current;
            const at = order.timeline.find((entry) => entry.status === step.status)?.at;
            return (
              <li
                key={step.status}
                aria-current={index === current ? 'step' : undefined}
                className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2"
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs ${done ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  aria-hidden="true"
                >
                  {done ? <Check className="size-4" /> : index + 1}
                </span>
                <span className="text-sm">
                  <span className={done ? 'font-medium' : 'text-muted-foreground'}>
                    {step.label}
                  </span>
                  <span className="sr-only">{done ? ' (done)' : ' (not yet)'}</span>
                  {at ? (
                    <span className="block text-xs text-muted-foreground">{formatTime(at)}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      <section
        aria-labelledby="items-heading"
        className="flex flex-col gap-3 rounded-xl border p-4"
      >
        <h2 id="items-heading" className="font-semibold">
          Your order
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {order.items.map((item, index) => (
            <li key={`${item.productName}-${index}`} className="flex justify-between gap-3">
              <span className="min-w-0">
                {item.quantity} × {item.productName}
                <span className="text-muted-foreground"> · {item.variantName}</span>
                {item.addOns.length > 0 ? (
                  <span className="block text-xs text-muted-foreground">
                    {item.addOns.map((addOn) => addOn.name).join(', ')}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">{formatRupees(item.lineSubtotalMinor)}</span>
            </li>
          ))}
        </ul>
        <PriceBreakdownList
          totals={order.totals}
          isDelivery={isDelivery}
          promotionCode={order.promotionCode}
        />
        <p className="text-sm text-muted-foreground">
          {order.paymentStatus === 'PAID'
            ? 'Paid'
            : `${isDelivery ? 'Cash on delivery' : 'Pay cash at pickup'} · ${formatRupees(order.totals.totalMinor)} due`}
        </p>
      </section>

      <section
        aria-labelledby="details-heading"
        className="flex flex-col gap-3 rounded-xl border p-4 text-sm"
      >
        <h2 id="details-heading" className="font-semibold">
          {isDelivery ? 'Delivery details' : 'Pickup details'}
        </h2>
        <p>
          {order.customerName} · {order.customerPhone}
        </p>
        {order.delivery ? (
          <address className="text-muted-foreground not-italic">
            {order.delivery.addressLine}
            {order.delivery.area ? `, ${order.delivery.area}` : ''}, {order.delivery.city}
            {order.delivery.landmark ? (
              <span className="block">Near {order.delivery.landmark}</span>
            ) : null}
            {order.delivery.instructions ? (
              <span className="block">“{order.delivery.instructions}”</span>
            ) : null}
          </address>
        ) : (
          <address className="text-muted-foreground not-italic">
            {order.branch.name}, {order.branch.addressLine}, {order.branch.city}
          </address>
        )}
        {order.note ? <p className="text-muted-foreground">Note: {order.note}</p> : null}
        {order.branch.phone ? (
          <a
            href={`tel:${order.branch.phone}`}
            className="inline-flex items-center gap-2 font-medium underline underline-offset-4"
          >
            <Phone className="size-4" aria-hidden="true" />
            Call {order.restaurant.name}
          </a>
        ) : null}
      </section>

      {cancelError ? <Alert variant="destructive" title={cancelError} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {order.canCancel ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" disabled={cancelState.isLoading}>
                Cancel order
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                <AlertDialogDescription>
                  You can cancel until the restaurant confirms your order.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep order</AlertDialogCancel>
                <AlertDialogAction onClick={() => void cancel()}>Cancel order</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <Button asChild variant="ghost">
          <Link href={storefrontPath(order.restaurant.slug)}>Back to the menu</Link>
        </Button>
      </div>
    </main>
  );
}
