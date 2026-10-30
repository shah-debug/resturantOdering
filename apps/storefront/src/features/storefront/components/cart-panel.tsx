'use client';

import { CART_LIMITS, findStorefrontProduct, formatRupees, type Storefront } from '@app/contracts';
import { Button, Separator } from '@app/web/ui';
import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import type { PricedCart } from '@/features/cart/cart-pricing';
import type { StoreAvailability } from '../availability';
import { takesOnlineOrders } from '../availability';
import { storefrontPath } from '../seo';
import { QuantityStepper } from './quantity-stepper';

export function CartPanel({
  storefront,
  availability,
  cart,
  onQuantityChange,
  onRemove,
  onClear,
}: {
  storefront: Storefront;
  availability: StoreAvailability;
  cart: PricedCart;
  onQuantityChange: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
}) {
  const delivery =
    storefront.branches.filter(takesOnlineOrders).find((branch) => branch.delivery)?.delivery ??
    null;
  const shortfall =
    delivery && delivery.minimumOrderMinor > cart.subtotalMinor
      ? delivery.minimumOrderMinor - cart.subtotalMinor
      : 0;

  if (cart.lines.length === 0) {
    return (
      <section aria-labelledby="cart-heading" className="flex flex-col gap-4">
        <h2 id="cart-heading" className="text-lg font-semibold">
          Your cart
        </h2>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center">
          <ShoppingBag className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Your cart is empty</p>
          <p className="text-sm text-muted-foreground">
            Add dishes from the menu to start an order.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="cart-heading" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="cart-heading" className="text-lg font-semibold">
          Your cart
        </h2>
        <Button type="button" variant="link" size="sm" className="px-0" onClick={onClear}>
          Clear cart
        </Button>
      </div>

      <ul className="flex flex-col divide-y" aria-label="Cart items">
        {cart.lines.map(({ line, result, lineTotalMinor }) => {
          if (!result.ok) {
            return (
              <li key={line.key} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-muted-foreground line-through">
                    {line.quantity} ×{' '}
                    {findStorefrontProduct(storefront.categories, line.productId)?.name ??
                      'Item no longer on the menu'}
                  </p>
                  <p className="text-sm text-destructive">{result.reason}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onRemove(line.key)}
                >
                  Remove
                </Button>
              </li>
            );
          }
          const details = [
            result.product.variants.length > 1 ? result.variant.name : null,
            ...result.addOns.map((addOn) => addOn.name),
          ].filter((value): value is string => value !== null);
          return (
            <li key={line.key} className="flex flex-col gap-2 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium break-words">{result.product.name}</p>
                  {details.length > 0 ? (
                    <p className="text-sm text-muted-foreground">{details.join(', ')}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">
                  {formatRupees(lineTotalMinor)}
                </p>
              </div>
              <QuantityStepper
                value={line.quantity}
                min={1}
                max={CART_LIMITS.maxQuantityPerLine}
                label={result.product.name}
                removeAtMin
                onChange={(quantity) =>
                  quantity < 1 ? onRemove(line.key) : onQuantityChange(line.key, quantity)
                }
              />
            </li>
          );
        })}
      </ul>

      {cart.unavailableCount > 0 ? (
        <p className="rounded-lg bg-muted p-3 text-sm" role="status">
          Some items are no longer available and are not included in the subtotal.
        </p>
      ) : null}

      <Separator />
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between gap-2 text-base font-semibold">
          <dt>Subtotal</dt>
          <dd className="tabular-nums" data-testid="cart-subtotal">
            {formatRupees(cart.subtotalMinor)}
          </dd>
        </div>
        <p className="text-muted-foreground">
          Prices are checked again when you place your order. Delivery fees and taxes are added at
          checkout.
        </p>
      </dl>

      {shortfall > 0 && delivery ? (
        <p className="text-sm text-muted-foreground">
          Add {formatRupees(shortfall)} more for delivery (minimum{' '}
          {formatRupees(delivery.minimumOrderMinor)}).
        </p>
      ) : null}
      {availability.state !== 'open' ? (
        <p className="text-sm text-muted-foreground">
          {availability.label}
          {availability.detail ? ` · ${availability.detail}` : ''}
        </p>
      ) : null}

      {cart.itemCount > 0 && availability.state !== 'unavailable' ? (
        <Button asChild size="lg">
          <Link href={`${storefrontPath(storefront.slug)}/checkout`}>Checkout</Link>
        </Button>
      ) : (
        <Button type="button" size="lg" disabled>
          Checkout
        </Button>
      )}
    </section>
  );
}
