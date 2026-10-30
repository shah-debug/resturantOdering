'use client';

import {
  formatRupees,
  type Storefront,
  type StorefrontCategory,
  type StorefrontProduct,
} from '@app/contracts';
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@app/web/ui';
import { Search, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { priceCart } from '@/features/cart/cart-pricing';
import {
  cartCleared,
  lineAdded,
  lineRemoved,
  quantityChanged,
  selectCartLines,
} from '@/features/cart/cart-slice';
import { useCartPersistence } from '@/features/cart/use-cart-persistence';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { StoreAvailability } from '../availability';
import { CartPanel } from './cart-panel';
import { ProductCard } from './product-card';
import { type ProductChoice, ProductDialog } from './product-dialog';
import { RestaurantHeader } from './restaurant-header';
import { StoreInfo } from './store-info';

export function filterMenu(
  categories: readonly StorefrontCategory[],
  query: string,
): StorefrontCategory[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...categories];
  }
  return categories
    .map((category) => ({
      ...category,
      products: category.products.filter((product) =>
        `${product.name} ${product.description ?? ''} ${category.name}`
          .toLowerCase()
          .includes(needle),
      ),
    }))
    .filter((category) => category.products.length > 0);
}

function sectionId(category: StorefrontCategory): string {
  return `category-${category.slug}`;
}

function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || ids.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

export function StorefrontView({
  storefront,
  availability,
}: {
  storefront: Storefront;
  availability: StoreAvailability;
}) {
  const slug = storefront.slug;
  const dispatch = useAppDispatch();
  useCartPersistence(slug);
  const lines = useAppSelector((state) => selectCartLines(state, slug));
  const cart = useMemo(() => priceCart(storefront.categories, lines), [storefront, lines]);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StorefrontProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const visible = useMemo(
    () => filterMenu(storefront.categories, query),
    [storefront.categories, query],
  );
  const sectionIds = useMemo(() => visible.map(sectionId), [visible]);
  const activeSection = useActiveSection(sectionIds);
  const canOrder = availability.state !== 'unavailable';

  function addToCart(product: StorefrontProduct, choice: ProductChoice) {
    dispatch(
      lineAdded({
        slug,
        selection: {
          productId: product.id,
          variantId: choice.variantId,
          addOnIds: choice.addOnIds,
        },
        quantity: choice.quantity,
      }),
    );
    setSelected(null);
    setAnnouncement(`Added ${choice.quantity} × ${product.name} to your cart`);
  }

  const cartPanel = (
    <CartPanel
      storefront={storefront}
      availability={availability}
      cart={cart}
      onQuantityChange={(key, quantity) => dispatch(quantityChanged({ slug, key, quantity }))}
      onRemove={(key) => dispatch(lineRemoved({ slug, key }))}
      onClear={() => dispatch(cartCleared({ slug }))}
    />
  );

  return (
    <div data-storefront className="min-h-dvh bg-background pb-24 lg:pb-0">
      <RestaurantHeader storefront={storefront} availability={availability} />

      <div className="mx-auto max-w-6xl px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <main id="menu" className="min-w-0">
          <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b bg-background/95 px-4 pt-4 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <label htmlFor="menu-search" className="sr-only">
                Search the menu
              </label>
              <Input
                id="menu-search"
                type="search"
                placeholder="Search dishes"
                autoComplete="off"
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {visible.length > 1 ? (
              <nav aria-label="Menu categories" className="-mx-4 overflow-x-auto px-4">
                <ul className="flex w-max gap-2">
                  {visible.map((category) => {
                    const id = sectionId(category);
                    const isActive = activeSection === id;
                    return (
                      <li key={category.id}>
                        <a
                          href={`#${id}`}
                          aria-current={isActive ? 'location' : undefined}
                          className={`inline-flex h-9 items-center rounded-full border px-4 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${isActive ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
                        >
                          {category.name}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ) : null}
          </div>

          {availability.state !== 'open' ? (
            <div
              role="status"
              className="mt-4 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm"
            >
              <p className="font-medium">{availability.label}</p>
              {availability.detail ? (
                <p className="text-muted-foreground">{availability.detail}</p>
              ) : null}
              {availability.state === 'closed' ? (
                <p className="text-muted-foreground">
                  You can browse the menu and build your cart now.
                </p>
              ) : null}
            </div>
          ) : null}

          {storefront.categories.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-lg font-medium">The menu is coming soon</p>
              <p className="text-sm text-muted-foreground">
                {storefront.name} hasn&apos;t published any dishes yet.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-lg font-medium">No dishes match &ldquo;{query.trim()}&rdquo;</p>
              <Button type="button" variant="outline" onClick={() => setQuery('')}>
                Clear search
              </Button>
            </div>
          ) : (
            visible.map((category) => (
              <section
                key={category.id}
                id={sectionId(category)}
                aria-labelledby={`${sectionId(category)}-heading`}
                className="scroll-mt-32 py-6"
              >
                <h2 id={`${sectionId(category)}-heading`} className="text-xl font-semibold">
                  {category.name}
                </h2>
                {category.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
                ) : null}
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {category.products.map((product) => (
                    <ProductCard key={product.id} product={product} onSelect={setSelected} />
                  ))}
                </ul>
              </section>
            ))
          )}

          <StoreInfo storefront={storefront} />
        </main>

        <aside className="hidden lg:block" aria-label="Cart">
          <div className="sticky top-4 mt-6 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border bg-card p-5">
            {cartPanel}
          </div>
        </aside>
      </div>

      {cart.lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
          <Button
            type="button"
            size="lg"
            className="w-full justify-between"
            onClick={() => setCartOpen(true)}
            aria-label={`View cart, ${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'}, subtotal ${formatRupees(cart.subtotalMinor)}`}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag aria-hidden="true" />
              View cart
              <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs tabular-nums">
                {cart.itemCount}
              </span>
            </span>
            <span className="tabular-nums">{formatRupees(cart.subtotalMinor)}</span>
          </Button>
        </div>
      ) : null}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl lg:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Cart</SheetTitle>
            <SheetDescription>Review the items in your cart</SheetDescription>
          </SheetHeader>
          <div className="p-4 pt-6">{cartPanel}</div>
        </SheetContent>
      </Sheet>

      <ProductDialog
        product={selected}
        canOrder={canOrder}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        onAdd={addToCart}
      />

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
