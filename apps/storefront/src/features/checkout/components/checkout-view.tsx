'use client';

import { formatRupees, type OrderType, type Storefront } from '@app/contracts';
import { getErrorMessage, toApiError } from '@app/web/api';
import { Alert, Button, Field, Input, Select, Skeleton, Textarea } from '@app/web/ui';
import { ArrowLeft, Bike, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { cartCleared, selectCartLines, selectCartRestored } from '@/features/cart/cart-slice';
import { useCartPersistence } from '@/features/cart/use-cart-persistence';
import { type StoreAvailability, takesOnlineOrders } from '@/features/storefront/availability';
import { storefrontPath } from '@/features/storefront/seo';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useQuoteCheckoutMutation, usePlaceOrderMutation } from '../checkout-api';
import {
  buildOrderRequest,
  buildQuoteRequest,
  type CheckoutErrors,
  type CheckoutForm,
  newIdempotencyKey,
} from '../checkout-form';
import { PriceBreakdownList } from './price-breakdown';

const QUOTE_DELAY_MS = 350;

export function orderTrackingPath(slug: string, orderId: string, token: string): string {
  return `${storefrontPath(slug)}/orders/${orderId}?token=${encodeURIComponent(token)}`;
}

function initialForm(storefront: Storefront): CheckoutForm {
  const branch = storefront.branches.find(takesOnlineOrders) ?? storefront.branches[0];
  return {
    type: branch?.delivery ? 'DELIVERY' : 'PICKUP',
    branchId: branch?.id ?? '',
    name: '',
    phone: '',
    addressLine: '',
    area: '',
    city: branch?.city ?? '',
    landmark: '',
    instructions: '',
    note: '',
    promoCode: '',
    paymentMethod: 'CASH',
  };
}

export function CheckoutView({
  storefront,
  availability,
}: {
  storefront: Storefront;
  availability: StoreAvailability;
}) {
  const slug = storefront.slug;
  const router = useRouter();
  const dispatch = useAppDispatch();
  useCartPersistence(slug);
  const restored = useAppSelector((state) => selectCartRestored(state, slug));
  const lines = useAppSelector((state) => selectCartLines(state, slug));

  const [form, setForm] = useState<CheckoutForm>(() => initialForm(storefront));
  const [promoInput, setPromoInput] = useState('');
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitDetails, setSubmitDetails] = useState<string[]>([]);
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);

  const [requestQuote, quoteState] = useQuoteCheckoutMutation();
  const [placeOrder, placeState] = usePlaceOrderMutation();

  const branches = storefront.branches.filter(takesOnlineOrders);
  const branch = branches.find((item) => item.id === form.branchId) ?? null;
  const offersDelivery = Boolean(branch?.delivery);
  const offersPickup = branch?.pickupEnabled === true;

  const quoteRequest = useMemo(() => buildQuoteRequest(form, lines), [form, lines]);
  const quoteKey = quoteRequest ? JSON.stringify(quoteRequest) : null;

  useEffect(() => {
    if (!quoteKey) {
      return;
    }
    const timer = setTimeout(() => {
      void requestQuote({ slug, body: JSON.parse(quoteKey) as NonNullable<typeof quoteRequest> });
    }, QUOTE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [quoteKey, requestQuote, slug]);

  const quoteMatches =
    quoteKey !== null &&
    quoteState.originalArgs !== undefined &&
    JSON.stringify(quoteState.originalArgs.body) === quoteKey;
  const quote = quoteMatches ? quoteState.data : undefined;
  const quoteLoading = quoteKey !== null && (!quoteMatches || quoteState.isLoading);

  function update<K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function chooseType(type: OrderType) {
    update('type', type);
  }

  function applyPromo() {
    update('promoCode', promoInput.trim().toUpperCase());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitDetails([]);
    if (!quote?.canPlaceOrder || !quote.totals) {
      return;
    }
    const built = buildOrderRequest(form, lines, quote.totals.totalMinor);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    const fingerprint = JSON.stringify(built.body);
    if (idempotency.current?.fingerprint !== fingerprint) {
      idempotency.current = { fingerprint, key: newIdempotencyKey() };
    }
    try {
      const placed = await placeOrder({
        slug,
        idempotencyKey: idempotency.current.key,
        body: built.body,
      }).unwrap();
      dispatch(cartCleared({ slug }));
      router.push(`${orderTrackingPath(slug, placed.orderId, placed.trackingToken)}&placed=1`);
    } catch (error) {
      const apiError = toApiError(error as Parameters<typeof toApiError>[0]);
      if (apiError?.code === 'PRICE_CHANGED') {
        setSubmitError(
          'Prices have changed. Please check your new total and place the order again.',
        );
      } else if (apiError?.code === 'CHECKOUT_REJECTED') {
        setSubmitError(apiError.message);
        setSubmitDetails(apiError.details?.map((detail) => detail.message) ?? []);
      } else if (apiError?.code === 'RATE_LIMITED') {
        setSubmitError('Too many attempts. Please wait a minute and try again.');
      } else {
        setSubmitError(getErrorMessage(error as Parameters<typeof getErrorMessage>[0]));
      }
      if (quoteRequest) {
        void requestQuote({ slug, body: quoteRequest });
      }
    }
  }

  const backLink = (
    <Link
      href={storefrontPath(slug)}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to menu
    </Link>
  );

  if (!restored) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <ShoppingBag className="size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight">Your cart is empty</h1>
        <p className="text-muted-foreground">Add dishes from the menu before checking out.</p>
        <Button asChild>
          <Link href={storefrontPath(slug)}>Browse the menu</Link>
        </Button>
      </main>
    );
  }

  const isDelivery = form.type === 'DELIVERY';
  const placing = placeState.isLoading;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <div className="flex flex-col gap-2">
        {backLink}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Checkout</h1>
        <p className="text-sm text-muted-foreground">{storefront.name}</p>
      </div>

      {availability.state !== 'open' ? (
        <Alert className="mt-4" title={availability.label}>
          {availability.detail}
        </Alert>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="fulfillment-heading" className="flex flex-col gap-4">
            <h2 id="fulfillment-heading" className="text-lg font-semibold">
              How would you like your order?
            </h2>
            {branches.length > 1 ? (
              <Field label="Location">
                {(control) => (
                  <Select
                    {...control}
                    value={form.branchId}
                    onChange={(event) => update('branchId', event.target.value)}
                  >
                    {branches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {item.area ? `${item.area}, ` : ''}
                        {item.city}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
            <div role="radiogroup" aria-label="Order type" className="grid grid-cols-2 gap-3">
              {(
                [
                  { type: 'DELIVERY', label: 'Delivery', enabled: offersDelivery },
                  { type: 'PICKUP', label: 'Pickup', enabled: offersPickup },
                ] as const
              ).map((option) => (
                <label
                  key={option.type}
                  className={`flex min-h-12 items-center gap-3 rounded-lg border px-4 text-sm font-medium ${option.enabled ? 'cursor-pointer hover:bg-accent' : 'opacity-50'} ${form.type === option.type ? 'border-primary ring-1 ring-primary' : ''}`}
                >
                  <input
                    type="radio"
                    name="order-type"
                    className="size-4 accent-[var(--primary)]"
                    checked={form.type === option.type}
                    disabled={!option.enabled}
                    onChange={() => chooseType(option.type)}
                  />
                  {option.label}
                  {option.enabled ? null : (
                    <span className="text-xs font-normal text-muted-foreground">Unavailable</span>
                  )}
                </label>
              ))}
            </div>
            {!isDelivery && branch ? (
              <p className="text-sm text-muted-foreground">
                Pick up from {branch.name}, {branch.addressLine}, {branch.city}.
              </p>
            ) : null}
          </section>

          <section aria-labelledby="contact-heading" className="flex flex-col gap-4">
            <h2 id="contact-heading" className="text-lg font-semibold">
              Your details
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={errors.name}>
                {(control) => (
                  <Input
                    {...control}
                    autoComplete="name"
                    value={form.name}
                    maxLength={120}
                    onChange={(event) => update('name', event.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Mobile number"
                error={errors.phone}
                hint="The restaurant will call this number about your order."
              >
                {(control) => (
                  <Input
                    {...control}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0300 1234567"
                    value={form.phone}
                    maxLength={20}
                    onChange={(event) => update('phone', event.target.value)}
                  />
                )}
              </Field>
            </div>
          </section>

          {isDelivery ? (
            <section aria-labelledby="address-heading" className="flex flex-col gap-4">
              <h2 id="address-heading" className="text-lg font-semibold">
                Delivery address
              </h2>
              <Field label="House and street" error={errors.addressLine}>
                {(control) => (
                  <Input
                    {...control}
                    autoComplete="address-line1"
                    value={form.addressLine}
                    maxLength={255}
                    onChange={(event) => update('addressLine', event.target.value)}
                  />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Area"
                  error={errors.area}
                  hint="For example Gulberg III or DHA Phase 5"
                >
                  {(control) => (
                    <Input
                      {...control}
                      autoComplete="address-level3"
                      value={form.area}
                      maxLength={120}
                      onChange={(event) => update('area', event.target.value)}
                    />
                  )}
                </Field>
                <Field label="City" error={errors.city}>
                  {(control) => (
                    <Input
                      {...control}
                      autoComplete="address-level2"
                      value={form.city}
                      maxLength={80}
                      onChange={(event) => update('city', event.target.value)}
                    />
                  )}
                </Field>
              </div>
              <Field label="Nearby landmark (optional)" error={errors.landmark}>
                {(control) => (
                  <Input
                    {...control}
                    value={form.landmark}
                    maxLength={160}
                    onChange={(event) => update('landmark', event.target.value)}
                  />
                )}
              </Field>
              <Field label="Delivery instructions (optional)" error={errors.instructions}>
                {(control) => (
                  <Textarea
                    {...control}
                    rows={2}
                    value={form.instructions}
                    maxLength={500}
                    onChange={(event) => update('instructions', event.target.value)}
                  />
                )}
              </Field>
            </section>
          ) : null}

          <section aria-labelledby="extra-heading" className="flex flex-col gap-4">
            <h2 id="extra-heading" className="text-lg font-semibold">
              Anything else?
            </h2>
            <Field label="Note for the restaurant (optional)" error={errors.note}>
              {(control) => (
                <Textarea
                  {...control}
                  rows={2}
                  value={form.note}
                  maxLength={500}
                  placeholder="For example: less spicy"
                  onChange={(event) => update('note', event.target.value)}
                />
              )}
            </Field>
            <div className="flex items-end gap-2">
              <Field label="Promo code" className="flex-1">
                {(control) => (
                  <Input
                    {...control}
                    value={promoInput}
                    maxLength={40}
                    autoCapitalize="characters"
                    onChange={(event) => setPromoInput(event.target.value)}
                  />
                )}
              </Field>
              {form.promoCode ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPromoInput('');
                    update('promoCode', '');
                  }}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={promoInput.trim().length === 0}
                  onClick={applyPromo}
                >
                  Apply
                </Button>
              )}
            </div>
          </section>

          <section aria-labelledby="payment-heading" className="flex flex-col gap-3">
            <h2 id="payment-heading" className="text-lg font-semibold">
              Payment
            </h2>
            <label className="flex min-h-12 items-center gap-3 rounded-lg border border-primary px-4 text-sm font-medium ring-1 ring-primary">
              <input
                type="radio"
                name="payment-method"
                className="size-4 accent-[var(--primary)]"
                checked={form.paymentMethod === 'CASH'}
                onChange={() => update('paymentMethod', 'CASH')}
              />
              {isDelivery ? 'Cash on delivery' : 'Pay cash at pickup'}
            </label>
            <p className="text-xs text-muted-foreground">
              You pay when you receive your order. Online payment is not available yet.
            </p>
          </section>
        </div>

        <aside aria-labelledby="summary-heading" className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <h2 id="summary-heading" className="text-lg font-semibold">
              Order summary
            </h2>

            {quote ? (
              <ul className="flex flex-col gap-2 text-sm" aria-label="Items">
                {quote.lines.map((line, index) => (
                  <li key={`${line.productId}-${index}`} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      {line.quantity} × {line.productName}
                      <span className="text-muted-foreground"> · {line.variantName}</span>
                      {line.addOns.length > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          {line.addOns.map((addOn) => addOn.name).join(', ')}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatRupees(line.lineSubtotalMinor)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {quoteKey === null && isDelivery ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bike className="size-4" aria-hidden="true" />
                Enter your area and city to see the delivery fee.
              </p>
            ) : null}

            {quoteLoading && !quote ? (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Calculating total">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : null}

            {quoteState.isError && !quote ? (
              <Alert variant="destructive" title="We couldn’t calculate your total">
                {getErrorMessage(quoteState.error)}
              </Alert>
            ) : null}

            {quote?.totals ? (
              <PriceBreakdownList
                totals={quote.totals}
                isDelivery={isDelivery}
                promotionCode={quote.promotion?.code ?? null}
              />
            ) : null}

            {quote && quote.issues.length > 0 ? (
              <div role="alert" className="rounded-lg border border-destructive/50 p-3 text-sm">
                <ul className="flex list-disc flex-col gap-1 pl-4 text-destructive">
                  {quote.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                  ))}
                </ul>
                {quote.issues.some((issue) => issue.code === 'ITEM_UNAVAILABLE') ? (
                  <Link
                    href={storefrontPath(slug)}
                    className="mt-2 inline-block underline underline-offset-4"
                  >
                    Update your cart
                  </Link>
                ) : null}
              </div>
            ) : null}

            {quote?.estimatedMinutes ? (
              <p className="text-sm text-muted-foreground">
                {isDelivery ? 'Delivery' : 'Ready for pickup'} in about {quote.estimatedMinutes}{' '}
                minutes after the restaurant confirms.
              </p>
            ) : null}

            {submitError ? (
              <Alert variant="destructive" title={submitError}>
                {submitDetails.length > 0 ? (
                  <ul className="list-disc pl-4">
                    {submitDetails.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                ) : null}
              </Alert>
            ) : null}

            <Button
              type="submit"
              size="lg"
              disabled={!quote?.canPlaceOrder || placing || quoteLoading}
            >
              {placing
                ? 'Placing order…'
                : quote?.totals
                  ? `Place order · ${formatRupees(quote.totals.totalMinor)}`
                  : 'Place order'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Final prices are confirmed by the restaurant&apos;s system when you place the order.
            </p>
          </div>
        </aside>
      </form>
    </main>
  );
}
