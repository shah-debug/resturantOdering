import { CART_LIMITS, type CartSelection } from '@app/contracts';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';

export interface CartLine {
  key: string;
  productId: string;
  variantId: string;
  addOnIds: string[];
  quantity: number;
}

export interface CartState {
  carts: Record<string, CartLine[]>;
  restored: Record<string, boolean>;
}

const initialState: CartState = { carts: {}, restored: {} };

export function cartLineKey(selection: CartSelection): string {
  return [selection.productId, selection.variantId, [...selection.addOnIds].sort().join('+')].join(
    ':',
  );
}

function clampQuantity(quantity: number): number {
  return Math.min(CART_LIMITS.maxQuantityPerLine, Math.max(1, Math.trunc(quantity)));
}

export const storedCartSchema = z
  .array(
    z.object({
      productId: z.uuid(),
      variantId: z.uuid(),
      addOnIds: z.array(z.uuid()).max(100),
      quantity: z.number().int().min(1).max(CART_LIMITS.maxQuantityPerLine),
    }),
  )
  .max(CART_LIMITS.maxLines);

export const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    lineAdded(
      state,
      action: PayloadAction<{ slug: string; selection: CartSelection; quantity: number }>,
    ) {
      const { slug, selection, quantity } = action.payload;
      const lines = (state.carts[slug] ??= []);
      const key = cartLineKey(selection);
      const existing = lines.find((line) => line.key === key);
      if (existing) {
        existing.quantity = clampQuantity(existing.quantity + quantity);
        return;
      }
      if (lines.length >= CART_LIMITS.maxLines) {
        return;
      }
      lines.push({
        key,
        productId: selection.productId,
        variantId: selection.variantId,
        addOnIds: [...selection.addOnIds],
        quantity: clampQuantity(quantity),
      });
    },
    quantityChanged(state, action: PayloadAction<{ slug: string; key: string; quantity: number }>) {
      const { slug, key, quantity } = action.payload;
      const lines = state.carts[slug];
      if (!lines) {
        return;
      }
      if (quantity < 1) {
        state.carts[slug] = lines.filter((line) => line.key !== key);
        return;
      }
      const line = lines.find((item) => item.key === key);
      if (line) {
        line.quantity = clampQuantity(quantity);
      }
    },
    lineRemoved(state, action: PayloadAction<{ slug: string; key: string }>) {
      const { slug, key } = action.payload;
      state.carts[slug] = (state.carts[slug] ?? []).filter((line) => line.key !== key);
    },
    cartCleared(state, action: PayloadAction<{ slug: string }>) {
      state.carts[action.payload.slug] = [];
    },
    cartRestored(state, action: PayloadAction<{ slug: string; stored: unknown }>) {
      if (state.restored[action.payload.slug]) {
        return;
      }
      state.restored[action.payload.slug] = true;
      const parsed = storedCartSchema.safeParse(action.payload.stored);
      if (!parsed.success) {
        return;
      }
      const merged = new Map<string, CartLine>();
      for (const line of parsed.data) {
        const key = cartLineKey(line);
        const quantity = clampQuantity((merged.get(key)?.quantity ?? 0) + line.quantity);
        merged.set(key, { ...line, key, quantity });
      }
      state.carts[action.payload.slug] = [...merged.values()];
    },
  },
});

export const { lineAdded, quantityChanged, lineRemoved, cartCleared, cartRestored } =
  cartSlice.actions;

const NO_LINES: CartLine[] = [];

export function selectCartRestored(state: { cart: CartState }, slug: string): boolean {
  return state.cart.restored[slug] === true;
}

export function selectCartLines(state: { cart: CartState }, slug: string): CartLine[] {
  return state.cart.carts[slug] ?? NO_LINES;
}
