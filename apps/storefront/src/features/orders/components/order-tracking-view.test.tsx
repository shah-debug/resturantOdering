import type { OrderTracking } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { makeStore } from '@/store/store';
import { errorResponse, mockApi } from '@/testing/api-mock';
import { currentStepIndex } from '../order-progress';
import { OrderTrackingView } from './order-tracking-view';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const TOKEN = 'b'.repeat(43);

function order(overrides: Partial<OrderTracking> = {}): OrderTracking {
  return {
    orderId: '018f0000-0000-7000-8000-0000000000ff',
    orderNumber: 42,
    restaurant: { name: 'Karahi House', slug: 'karahi-house' },
    branch: {
      name: 'Gulberg',
      phone: '+924235000000',
      addressLine: '12 Main Blvd',
      city: 'Lahore',
    },
    status: 'PENDING',
    timeline: [{ status: 'PENDING', at: '2026-10-30T10:00:00.000Z' }],
    type: 'DELIVERY',
    placedAt: '2026-10-30T10:00:00.000Z',
    estimatedMinutes: 40,
    paymentMethod: 'CASH',
    paymentStatus: 'UNPAID',
    customerName: 'Ayesha Khan',
    customerPhone: '+92300••••567',
    delivery: {
      addressLine: '45 Canal View Road',
      area: 'Model Town',
      city: 'Lahore',
      landmark: null,
      instructions: 'Ring twice',
    },
    note: null,
    items: [
      {
        productName: 'Chicken Karahi',
        variantName: 'Half',
        quantity: 2,
        addOns: [{ name: 'Naan', groupName: 'Bread' }],
        lineSubtotalMinor: 300_000,
      },
    ],
    promotionCode: null,
    totals: {
      currency: 'PKR',
      subtotalMinor: 300_000,
      discountMinor: 0,
      taxMinor: 0,
      taxRateBps: 0,
      pricesIncludeTax: false,
      deliveryFeeMinor: 15_000,
      deliveryDiscountMinor: 0,
      roundingAdjustmentMinor: 0,
      totalMinor: 315_000,
    },
    canCancel: true,
    ...overrides,
  };
}

describe('OrderTrackingView', () => {
  beforeEach(() => {
    navigation.refresh.mockClear();
  });

  it('confirms a new order and shows what is due on delivery', () => {
    mockApi(() => undefined);
    renderWithStore(<OrderTrackingView order={order()} token={TOKEN} justPlaced />, makeStore());
    expect(screen.getByText('Thank you! Your order has been placed.')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Waiting for the restaurant to confirm' }),
    ).toBeVisible();
    expect(screen.getByText('Karahi House · Order #42')).toBeVisible();
    expect(screen.getByText('Cash on delivery · Rs 3,150 due')).toBeVisible();
    const progress = within(screen.getByRole('list', { name: 'Order progress' }));
    expect(progress.getByText('Order placed').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('cancels with the tracking token after confirmation', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi((call) =>
      call.path.endsWith('/cancel')
        ? jsonResponse(order({ status: 'CANCELLED', canCancel: false }))
        : undefined,
    );
    renderWithStore(
      <OrderTrackingView order={order()} token={TOKEN} justPlaced={false} />,
      makeStore(),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel order' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel order' }),
    );
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
    expect(calls[0]?.path).toBe(
      '/storefront/restaurants/karahi-house/orders/018f0000-0000-7000-8000-0000000000ff/cancel',
    );
    expect(calls[0]?.headers.get('X-Order-Token')).toBe(TOKEN);
  });

  it('shows why cancelling failed', async () => {
    const user = userEvent.setup();
    mockApi(() => errorResponse(409, 'CONFLICT', 'This order can no longer be cancelled.'));
    renderWithStore(
      <OrderTrackingView order={order()} token={TOKEN} justPlaced={false} />,
      makeStore(),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel order' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel order' }),
    );
    expect(await screen.findByText('This order can no longer be cancelled.')).toBeVisible();
  });

  it('hides progress and cancellation for cancelled orders', () => {
    mockApi(() => undefined);
    renderWithStore(
      <OrderTrackingView
        order={order({ status: 'CANCELLED', canCancel: false })}
        token={TOKEN}
        justPlaced={false}
      />,
      makeStore(),
    );
    expect(screen.getByRole('heading', { name: 'Order cancelled' })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Order progress' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });

  it('maps statuses onto the progress steps', () => {
    expect(currentStepIndex('DELIVERY', 'READY')).toBe(2);
    expect(currentStepIndex('DELIVERY', 'DELIVERY_FAILED')).toBe(3);
    expect(currentStepIndex('PICKUP', 'READY')).toBe(3);
    expect(currentStepIndex('PICKUP', 'COMPLETED')).toBe(4);
    expect(currentStepIndex('DELIVERY', 'CANCELLED')).toBe(-1);
  });
});
