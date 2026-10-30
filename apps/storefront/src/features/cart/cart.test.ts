import { CART_LIMITS, resolveSelection } from '@app/contracts';
import { makeStore } from '@/store/store';
import { IDS, karahi, storefrontFixture } from '@/testing/storefront-fixture';
import { priceCart } from './cart-pricing';
import {
  cartCleared,
  cartLineKey,
  cartRestored,
  lineAdded,
  lineRemoved,
  quantityChanged,
  selectCartLines,
} from './cart-slice';

const halfWithNaan = { productId: IDS.karahi, variantId: IDS.karahiHalf, addOnIds: [IDS.naan] };

describe('cart slice', () => {
  it('merges identical selections regardless of add-on order', () => {
    const store = makeStore();
    const selection = { ...halfWithNaan, addOnIds: [IDS.naan, IDS.raita] };
    store.dispatch(lineAdded({ slug: 'a', selection, quantity: 1 }));
    store.dispatch(
      lineAdded({
        slug: 'a',
        selection: { ...selection, addOnIds: [IDS.raita, IDS.naan] },
        quantity: 2,
      }),
    );
    const lines = selectCartLines(store.getState(), 'a');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(3);
    expect(lines[0]?.key).toBe(cartLineKey(selection));
  });

  it('keeps each restaurant cart separate', () => {
    const store = makeStore();
    store.dispatch(lineAdded({ slug: 'a', selection: halfWithNaan, quantity: 1 }));
    store.dispatch(cartCleared({ slug: 'b' }));
    expect(selectCartLines(store.getState(), 'a')).toHaveLength(1);
    expect(selectCartLines(store.getState(), 'b')).toEqual([]);
  });

  it('clamps quantities and removes lines at zero', () => {
    const store = makeStore();
    store.dispatch(lineAdded({ slug: 'a', selection: halfWithNaan, quantity: 500 }));
    const key = selectCartLines(store.getState(), 'a')[0]?.key ?? '';
    expect(selectCartLines(store.getState(), 'a')[0]?.quantity).toBe(
      CART_LIMITS.maxQuantityPerLine,
    );
    store.dispatch(quantityChanged({ slug: 'a', key, quantity: 2 }));
    expect(selectCartLines(store.getState(), 'a')[0]?.quantity).toBe(2);
    store.dispatch(quantityChanged({ slug: 'a', key, quantity: 0 }));
    expect(selectCartLines(store.getState(), 'a')).toEqual([]);

    store.dispatch(lineAdded({ slug: 'a', selection: halfWithNaan, quantity: 1 }));
    store.dispatch(lineRemoved({ slug: 'a', key }));
    expect(selectCartLines(store.getState(), 'a')).toEqual([]);
  });

  it('caps the number of lines', () => {
    const store = makeStore();
    for (let index = 0; index < CART_LIMITS.maxLines + 5; index += 1) {
      const variantId = `018f0000-0000-7000-8000-${String(index).padStart(12, '0')}`;
      store.dispatch(
        lineAdded({ slug: 'a', selection: { ...halfWithNaan, variantId }, quantity: 1 }),
      );
    }
    expect(selectCartLines(store.getState(), 'a')).toHaveLength(CART_LIMITS.maxLines);
  });

  it('restores only well-formed stored carts and never stores prices', () => {
    const store = makeStore();
    store.dispatch(
      cartRestored({
        slug: 'a',
        stored: [{ ...halfWithNaan, quantity: 2, priceMinor: 1 }],
      }),
    );
    expect(selectCartLines(store.getState(), 'a')).toEqual([
      expect.not.objectContaining({ priceMinor: expect.anything() as unknown }),
    ]);

    for (const stored of [
      null,
      'not a cart',
      [{ ...halfWithNaan, quantity: 0 }],
      [{ ...halfWithNaan, productId: 'not-a-uuid', quantity: 1 }],
    ]) {
      const fresh = makeStore();
      fresh.dispatch(cartRestored({ slug: 'a', stored }));
      expect(selectCartLines(fresh.getState(), 'a')).toEqual([]);
    }
  });
});

describe('priceCart', () => {
  const lines = [
    { key: 'a', ...halfWithNaan, quantity: 2 },
    {
      key: 'b',
      productId: IDS.lassi,
      variantId: IDS.lassiRegular,
      addOnIds: [],
      quantity: 1,
    },
  ];

  it('prices lines from the current menu', () => {
    const cart = priceCart(storefrontFixture().categories, lines);
    expect(cart.subtotalMinor).toBe((145_000 + 5_000) * 2 + 35_000);
    expect(cart.itemCount).toBe(3);
    expect(cart.unavailableCount).toBe(0);
  });

  it('picks up price changes instead of trusting earlier prices', () => {
    const repriced = storefrontFixture();
    const product = repriced.categories[0]?.products[0];
    if (product?.variants[0]) {
      product.variants[0].priceMinor = 160_000;
    }
    expect(priceCart(repriced.categories, lines).subtotalMinor).toBe(
      (160_000 + 5_000) * 2 + 35_000,
    );
  });

  it('excludes lines that are no longer orderable', () => {
    const soldOut = storefrontFixture();
    const mains = soldOut.categories[0];
    if (mains) {
      mains.products = [karahi({ isAvailable: false })];
    }
    const cart = priceCart(soldOut.categories, lines);
    expect(cart.subtotalMinor).toBe(35_000);
    expect(cart.unavailableCount).toBe(1);
    expect(cart.lines[0]?.result).toEqual({ ok: false, reason: 'Sold out' });
  });
});

describe('resolveSelection', () => {
  const categories = storefrontFixture().categories;

  it.each([
    [{ ...halfWithNaan, addOnIds: [] }, 'Choose an option for Bread'],
    [{ ...halfWithNaan, addOnIds: [IDS.naan, IDS.roghni] }, 'Choose up to 1 for Bread'],
    [{ ...halfWithNaan, addOnIds: [IDS.naan, IDS.naan] }, 'Each extra can be chosen once'],
    [{ ...halfWithNaan, addOnIds: [IDS.naan, IDS.lassi] }, 'Some extras are no longer offered'],
    [{ ...halfWithNaan, variantId: IDS.lassiRegular }, 'This option is no longer offered'],
    [{ ...halfWithNaan, productId: IDS.branch }, 'No longer on the menu'],
    [{ productId: IDS.kheer, variantId: IDS.kheerBowl, addOnIds: [] }, 'Sold out'],
  ])('rejects %o', (selection, reason) => {
    expect(resolveSelection(categories, selection)).toEqual({ ok: false, reason });
  });

  it('rejects a sold-out option or extra', () => {
    const changed = storefrontFixture({
      categories: [
        {
          id: IDS.mains,
          name: 'Karahi',
          slug: 'karahi',
          description: null,
          products: [
            karahi({
              variants: [
                {
                  id: IDS.karahiHalf,
                  name: 'Half',
                  priceMinor: 145_000,
                  isAvailable: false,
                  isDefault: true,
                },
              ],
            }),
          ],
        },
      ],
    }).categories;
    expect(resolveSelection(changed, halfWithNaan)).toEqual({
      ok: false,
      reason: 'Half is sold out',
    });
  });

  it('adds extras to the option price', () => {
    const result = resolveSelection(categories, {
      productId: IDS.karahi,
      variantId: IDS.karahiFull,
      addOnIds: [IDS.roghni, IDS.raita, IDS.salad],
    });
    expect(result).toMatchObject({ ok: true, unitPriceMinor: 270_000 + 8_000 + 6_000 + 4_000 });
  });
});
