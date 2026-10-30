import type { CheckoutQuote } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { cartStorageKey } from '@/features/cart/use-cart-persistence';
import type { StoreAvailability } from '@/features/storefront/availability';
import { makeStore } from '@/store/store';
import { errorResponse, mockApi } from '@/testing/api-mock';
import { IDS, storefrontFixture } from '@/testing/storefront-fixture';
import { CheckoutView } from './checkout-view';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const OPEN: StoreAvailability = { state: 'open', label: 'Open now', detail: null };
const ORDER_ID = '018f0000-0000-7000-8000-0000000000ff';
const TOKEN = 'a'.repeat(43);

function quoteFor(totalMinor: number, overrides: Partial<CheckoutQuote> = {}): CheckoutQuote {
  return {
    lines: [
      {
        productId: IDS.lassi,
        variantId: IDS.lassiRegular,
        productName: 'Sweet Lassi',
        variantName: 'Regular',
        addOns: [],
        quantity: 2,
        unitPriceMinor: 35_000,
        addOnsTotalMinor: 0,
        lineSubtotalMinor: 70_000,
      },
    ],
    totals: {
      currency: 'PKR',
      subtotalMinor: 70_000,
      discountMinor: 0,
      taxMinor: 0,
      taxRateBps: 0,
      pricesIncludeTax: false,
      deliveryFeeMinor: totalMinor - 70_000,
      deliveryDiscountMinor: 0,
      roundingAdjustmentMinor: 0,
      totalMinor,
    },
    promotion: null,
    estimatedMinutes: 40,
    paymentMethods: ['CASH'],
    issues: [],
    canPlaceOrder: true,
    ...overrides,
  };
}

function seedCart() {
  window.localStorage.setItem(
    cartStorageKey('karahi-house'),
    JSON.stringify([
      { productId: IDS.lassi, variantId: IDS.lassiRegular, addOnIds: [], quantity: 2 },
    ]),
  );
}

function renderCheckout(availability: StoreAvailability = OPEN) {
  const store = makeStore();
  renderWithStore(
    <CheckoutView storefront={storefrontFixture()} availability={availability} />,
    store,
  );
  return store;
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Ayesha Khan');
  await user.type(screen.getByLabelText('Mobile number'), '0300 1234567');
  await user.type(screen.getByLabelText('House and street'), '45 Canal View Road');
}

describe('CheckoutView', () => {
  beforeEach(() => {
    window.localStorage.clear();
    navigation.push.mockClear();
  });

  it('shows an empty state without a cart', async () => {
    mockApi(() => undefined);
    renderCheckout();
    expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
  });

  it('asks for the area before showing a delivery fee, then shows the server total', async () => {
    seedCart();
    const user = userEvent.setup();
    const { calls } = mockApi((call) =>
      call.path.endsWith('/checkout/quote') ? jsonResponse(quoteFor(85_000)) : undefined,
    );
    renderCheckout();
    expect(
      await screen.findByText('Enter your area and city to see the delivery fee.'),
    ).toBeVisible();
    expect(calls).toHaveLength(0);

    await user.type(screen.getByLabelText('Area'), 'Model Town');
    expect(await screen.findByTestId('price-total')).toHaveTextContent('Rs 850');
    expect(screen.getByTestId('price-delivery')).toHaveTextContent('Rs 150');
    const quoteCall = calls.at(-1);
    expect(quoteCall?.body).toEqual({
      branchId: IDS.branch,
      fulfillment: { type: 'DELIVERY', address: { area: 'Model Town', city: 'Lahore' } },
      paymentMethod: 'CASH',
      promoCode: null,
      items: [{ productId: IDS.lassi, variantId: IDS.lassiRegular, addOnIds: [], quantity: 2 }],
    });
  });

  it('validates details, places the order once and goes to tracking', async () => {
    seedCart();
    const user = userEvent.setup();
    const { calls } = mockApi((call) => {
      if (call.path.endsWith('/checkout/quote')) return jsonResponse(quoteFor(85_000));
      if (call.path.endsWith('/orders')) {
        return jsonResponse(
          { orderId: ORDER_ID, orderNumber: 7, trackingToken: TOKEN, totalMinor: 85_000 },
          201,
        );
      }
      return undefined;
    });
    const store = renderCheckout();
    await user.type(await screen.findByLabelText('Area'), 'Model Town');
    const button = await screen.findByRole('button', { name: 'Place order · Rs 850' });

    await user.click(button);
    await fillDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Place order · Rs 850' }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    expect(navigation.push).toHaveBeenCalledWith(
      `/r/karahi-house/orders/${ORDER_ID}?token=${TOKEN}&placed=1`,
    );
    const placed = calls.filter((call) => call.path.endsWith('/orders'));
    expect(placed).toHaveLength(1);
    expect(placed[0]?.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(placed[0]?.body).toMatchObject({
      customer: { name: 'Ayesha Khan', phone: '+923001234567' },
      expectedTotalMinor: 85_000,
    });
    expect(store.getState().cart.carts['karahi-house']).toEqual([]);
  });

  it('shows field errors without calling the API', async () => {
    seedCart();
    const user = userEvent.setup();
    const { calls } = mockApi((call) =>
      call.path.endsWith('/checkout/quote') ? jsonResponse(quoteFor(85_000)) : undefined,
    );
    renderCheckout();
    await user.type(await screen.findByLabelText('Area'), 'Model Town');
    await user.click(await screen.findByRole('button', { name: 'Place order · Rs 850' }));
    expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription('Enter your name');
    expect(screen.getByLabelText('Mobile number')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.filter((call) => call.path.endsWith('/orders'))).toHaveLength(0);
  });

  it('reuses the idempotency key when retrying the same order after a network error', async () => {
    seedCart();
    const user = userEvent.setup();
    let attempts = 0;
    const { calls } = mockApi((call) => {
      if (call.path.endsWith('/checkout/quote')) return jsonResponse(quoteFor(85_000));
      if (call.path.endsWith('/orders')) {
        attempts += 1;
        return attempts === 1
          ? errorResponse(503, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
          : jsonResponse(
              { orderId: ORDER_ID, orderNumber: 7, trackingToken: TOKEN, totalMinor: 85_000 },
              201,
            );
      }
      return undefined;
    });
    renderCheckout();
    await user.type(await screen.findByLabelText('Area'), 'Model Town');
    await fillDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Place order · Rs 850' }));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Place order · Rs 850' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());

    const keys = calls
      .filter((call) => call.path.endsWith('/orders'))
      .map((call) => call.headers.get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('explains a price change and refreshes the total', async () => {
    seedCart();
    const user = userEvent.setup();
    let total = 85_000;
    mockApi((call) => {
      if (call.path.endsWith('/checkout/quote')) return jsonResponse(quoteFor(total));
      if (call.path.endsWith('/orders')) {
        total = 90_000;
        return errorResponse(409, 'PRICE_CHANGED', 'Prices have changed.');
      }
      return undefined;
    });
    renderCheckout();
    await user.type(await screen.findByLabelText('Area'), 'Model Town');
    await fillDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Place order · Rs 850' }));
    expect(
      await screen.findByText(
        'Prices have changed. Please check your new total and place the order again.',
      ),
    ).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Place order · Rs 900' })).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('blocks ordering and lists the reasons the server gives', async () => {
    seedCart();
    const user = userEvent.setup();
    mockApi((call) =>
      call.path.endsWith('/checkout/quote')
        ? jsonResponse(
            quoteFor(70_000, {
              canPlaceOrder: false,
              issues: [
                {
                  code: 'DELIVERY_UNAVAILABLE',
                  field: 'fulfillment.address.area',
                  message: 'Sorry, we don’t deliver to this address yet',
                },
              ],
            }),
          )
        : undefined,
    );
    renderCheckout();
    await user.type(await screen.findByLabelText('Area'), 'Faraway');
    expect(await screen.findByText('Sorry, we don’t deliver to this address yet')).toBeVisible();
    expect(screen.getByRole('button', { name: /Place order/ })).toBeDisabled();
  });

  it('switches to pickup without asking for an address', async () => {
    seedCart();
    const user = userEvent.setup();
    const { calls } = mockApi((call) =>
      call.path.endsWith('/checkout/quote') ? jsonResponse(quoteFor(70_000)) : undefined,
    );
    renderCheckout();
    await user.click(await screen.findByRole('radio', { name: 'Pickup' }));
    expect(screen.queryByLabelText('House and street')).not.toBeInTheDocument();
    expect(screen.getByText('Pay cash at pickup')).toBeVisible();
    await waitFor(() =>
      expect(calls.at(-1)?.body).toMatchObject({ fulfillment: { type: 'PICKUP' } }),
    );
  });
});
