'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/hooks';
import { type CartLine, cartRestored, selectCartLines } from './cart-slice';

export function cartStorageKey(slug: string): string {
  return `cart:v1:${slug}`;
}

function readStoredCart(slug: string): unknown {
  try {
    const raw = window.localStorage.getItem(cartStorageKey(slug));
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeStoredCart(slug: string, lines: readonly CartLine[]): void {
  try {
    const stored = lines.map(({ productId, variantId, addOnIds, quantity }) => ({
      productId,
      variantId,
      addOnIds,
      quantity,
    }));
    window.localStorage.setItem(cartStorageKey(slug), JSON.stringify(stored));
  } catch {
    return;
  }
}

export function useCartPersistence(slug: string): void {
  const store = useAppStore();

  useEffect(() => {
    store.dispatch(cartRestored({ slug, stored: readStoredCart(slug) }));
    let previous = selectCartLines(store.getState(), slug);
    return store.subscribe(() => {
      const lines = selectCartLines(store.getState(), slug);
      if (lines !== previous) {
        previous = lines;
        writeStoredCart(slug, lines);
      }
    });
  }, [store, slug]);
}
