import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import {
  branchFixture,
  errorResponse,
  meFixture,
  mockApi,
  ORGANIZATION_ID,
} from '@/testing/api-mock';
import {
  ORDER_ID,
  orderDetail,
  orderListItem,
  RIDER_ID,
  riderFixture,
} from '@/testing/order-fixtures';
import { LiveOrdersProvider } from '../live-orders';
import { LiveOrdersBanner } from './live-orders-banner';
import { KitchenPage } from './kitchen-page';
import { OrderDetailPage } from './order-detail-page';
import { OrdersPage } from './orders-page';
import { ReceiptPage } from './receipt-page';

const ORDERS = `/organizations/${ORGANIZATION_ID}/orders`;
const COUNTS = {
  new: 1,
  accepted: 0,
  preparing: 0,
  ready: 0,
  out_for_delivery: 0,
  delivered: 3,
  cancelled: 0,
};

function page(items = [orderListItem()]) {
  return jsonResponse({ items, page: 1, pageSize: 20, total: items.length });
}

describe('OrdersPage', () => {
  it('shows view tabs with counts and new orders', async () => {
    mockApi((call) => {
      if (call.path === `${ORDERS}/counts`) return jsonResponse(COUNTS);
      if (call.path === ORDERS) return page();
      if (call.path.endsWith('/branches')) return jsonResponse([branchFixture()]);
      return undefined;
    });
    renderWithStore(<OrdersPage organizationId={ORGANIZATION_ID} />, makeStore());
    expect(await screen.findByRole('link', { name: 'Order #42' })).toBeVisible();
    expect(await screen.findByRole('tab', { name: /New\s*1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Delivered\s*3/ })).toBeVisible();
    expect(screen.getByText(/Bilal Ahmed · 2 items/)).toHaveTextContent('Rs 3,150');
  });

  it('switches views and searches', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi((call) => {
      if (call.path === `${ORDERS}/counts`) return jsonResponse(COUNTS);
      if (call.path === ORDERS) return page([]);
      if (call.path.endsWith('/branches')) return jsonResponse([branchFixture()]);
      return undefined;
    });
    renderWithStore(<OrdersPage organizationId={ORGANIZATION_ID} />, makeStore());
    expect(await screen.findByText('No new orders')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: /Delivered/ }));
    await user.type(screen.getByLabelText('Search'), '42');
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path === ORDERS &&
            call.search.includes('view=delivered') &&
            call.search.includes('search=42'),
        ),
      ).toBe(true),
    );
  });

  it('accepts an order with the status it was showing', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi((call) => {
      if (call.path === `${ORDERS}/counts`) return jsonResponse(COUNTS);
      if (call.path === ORDERS) return page();
      if (call.path.endsWith('/branches')) return jsonResponse([branchFixture()]);
      if (call.path === `${ORDERS}/${ORDER_ID}/transitions`) {
        return jsonResponse(orderDetail({ status: 'CONFIRMED' }));
      }
      return undefined;
    });
    renderWithStore(<OrdersPage organizationId={ORGANIZATION_ID} />, makeStore());
    await user.click(await screen.findByRole('button', { name: 'Accept order #42' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/transitions'))?.body).toEqual({
        to: 'CONFIRMED',
        expectedStatus: 'PENDING',
      }),
    );
    expect(screen.queryByRole('button', { name: 'Reject order #42' })).not.toBeInTheDocument();
  });

  it('shows why a transition failed', async () => {
    const user = userEvent.setup();
    mockApi((call) => {
      if (call.path === `${ORDERS}/counts`) return jsonResponse(COUNTS);
      if (call.path === ORDERS) return page();
      if (call.path.endsWith('/branches')) return jsonResponse([branchFixture()]);
      if (call.path.endsWith('/transitions')) {
        return errorResponse(
          409,
          'CONFLICT',
          'This order was updated by someone else and is now CONFIRMED.',
        );
      }
      return undefined;
    });
    renderWithStore(<OrdersPage organizationId={ORGANIZATION_ID} />, makeStore());
    await user.click(await screen.findByRole('button', { name: 'Accept order #42' }));
    expect(await screen.findByText(/updated by someone else/)).toBeVisible();
  });
});

describe('OrderDetailPage', () => {
  it('requires a reason to reject and sends it', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi((call) => {
      if (call.path === `${ORDERS}/${ORDER_ID}`) return jsonResponse(orderDetail());
      if (call.path.endsWith('/transitions')) {
        return jsonResponse(
          orderDetail({
            status: 'REJECTED',
            availableTransitions: [],
            cancellationReason: 'Out of chicken',
          }),
        );
      }
      return undefined;
    });
    renderWithStore(
      <OrderDetailPage organizationId={ORGANIZATION_ID} orderId={ORDER_ID} />,
      makeStore(),
    );
    expect(await screen.findByRole('heading', { name: 'Order #42' })).toBeVisible();
    expect(screen.getByRole('link', { name: '+923009876543' })).toHaveAttribute(
      'href',
      'tel:+923009876543',
    );
    expect(screen.getByText('+ Bread: Naan')).toBeVisible();
    expect(screen.getByText(/Instructions: Ring twice/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reject order #42' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Reject' }));
    expect(dialog.getByText('Give a short reason (at least 3 characters)')).toBeVisible();
    expect(calls.some((call) => call.path.endsWith('/transitions'))).toBe(false);
    await user.type(dialog.getByLabelText('Reason'), 'Out of chicken');
    await user.click(dialog.getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/transitions'))?.body).toEqual({
        to: 'REJECTED',
        expectedStatus: 'PENDING',
        reason: 'Out of chicken',
      }),
    );
  });

  it('assigns a rider from the order branch with the current rider as the expected value', async () => {
    const user = userEvent.setup();
    const otherBranchRider = riderFixture({
      id: '018f0000-0000-7000-8000-0000000000ee',
      fullName: 'Elsewhere',
      branchId: '018f0000-0000-7000-8000-0000000000ff',
    });
    const assigned = orderDetail({
      status: 'READY',
      canAssignRider: true,
      rider: { id: RIDER_ID, fullName: 'Imran Khan', phone: '+923001110001' },
      availableTransitions: ['OUT_FOR_DELIVERY', 'CANCELLED'],
    });
    let current = orderDetail({
      status: 'READY',
      availableTransitions: ['CANCELLED'],
      canAssignRider: true,
    });
    const { calls } = mockApi((call) => {
      if (call.path === `${ORDERS}/${ORDER_ID}`) return jsonResponse(current);
      if (call.path.endsWith('/riders')) return jsonResponse([riderFixture(), otherBranchRider]);
      if (call.path.endsWith('/rider')) {
        current = assigned;
        return jsonResponse(assigned);
      }
      return undefined;
    });
    renderWithStore(
      <OrderDetailPage organizationId={ORGANIZATION_ID} orderId={ORDER_ID} />,
      makeStore(),
    );
    expect(await screen.findByText('Assign a rider to send this order out.')).toBeVisible();
    const select = await screen.findByLabelText('Rider');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    expect(within(select).queryByRole('option', { name: /Elsewhere/ })).not.toBeInTheDocument();
    await user.selectOptions(select, RIDER_ID);
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/rider'))?.body).toEqual({
        riderId: RIDER_ID,
        expectedRiderId: null,
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Send out for delivery order #42' }),
    ).toBeVisible();
  });
});

describe('KitchenPage', () => {
  it('shows tickets with customizations and notes', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi((call) => {
      if (call.path === ORDERS && call.search.includes('view=accepted')) {
        return page([orderListItem({ status: 'CONFIRMED', availableTransitions: ['PREPARING'] })]);
      }
      if (call.path === ORDERS) return page([]);
      if (call.path.endsWith('/transitions'))
        return jsonResponse(orderDetail({ status: 'PREPARING' }));
      return undefined;
    });
    renderWithStore(<KitchenPage organizationId={ORGANIZATION_ID} />, makeStore());
    const toStart = within(await screen.findByRole('region', { name: /To start/ }));
    expect(await toStart.findByText('2 × Chicken Karahi')).toBeVisible();
    expect(toStart.getByText('+ Naan')).toBeVisible();
    expect(toStart.getByText('Note: Less spicy')).toBeVisible();
    await user.click(toStart.getByRole('button', { name: 'Start preparing order #42' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/transitions'))?.body).toMatchObject({
        to: 'PREPARING',
        expectedStatus: 'CONFIRMED',
      }),
    );
  });
});

describe('ReceiptPage', () => {
  it('renders a printable receipt', async () => {
    mockApi((call) =>
      call.path === `${ORDERS}/${ORDER_ID}` ? jsonResponse(orderDetail()) : undefined,
    );
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const user = userEvent.setup();
    renderWithStore(
      <ReceiptPage organizationId={ORGANIZATION_ID} orderId={ORDER_ID} />,
      makeStore(),
    );
    const receipt = within(await screen.findByRole('article', { name: 'Receipt for order #42' }));
    expect(receipt.getByText('#42 · DELIVERY')).toBeVisible();
    expect(receipt.getByText('TO BE COLLECTED', { exact: false })).toBeVisible();
    expect(receipt.getByText('Rs 3,150')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
  });
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }

  close() {
    this.closed = true;
  }
}

describe('live orders', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('AudioContext', undefined);
  });

  it('announces new orders, re-fetches lists and shows a fallback when offline', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { calls } = mockApi((call) => {
        if (call.path === '/auth/me') return jsonResponse(meFixture());
        if (call.path === `${ORDERS}/counts`) return jsonResponse(COUNTS);
        if (call.path === ORDERS) return page();
        if (call.path.endsWith('/branches')) return jsonResponse([branchFixture()]);
        return undefined;
      });
      renderWithStore(
        <LiveOrdersProvider organizationId={ORGANIZATION_ID} enabled>
          <LiveOrdersBanner organizationId={ORGANIZATION_ID} />
          <OrdersPage organizationId={ORGANIZATION_ID} />
        </LiveOrdersProvider>,
        makeStore(),
      );
      await screen.findByRole('link', { name: 'Order #42' });
      const source = FakeEventSource.instances[0];
      expect(source?.url).toBe(`/api/v1${ORDERS}/events`);

      const before = calls.filter((call) => call.path === ORDERS).length;
      act(() => source?.emit('ready', {}));
      act(() =>
        source?.emit('order', {
          type: 'order.created',
          orderId: '018f0000-0000-7000-8000-000000000123',
          orderNumber: 43,
          branchId: '88888888-8888-4888-8888-888888888888',
          status: 'PENDING',
          at: '2026-10-31T10:00:00.000Z',
        }),
      );
      expect(await screen.findByText('New order #43')).toBeVisible();
      await waitFor(() =>
        expect(calls.filter((call) => call.path === ORDERS).length).toBeGreaterThan(before),
      );

      act(() => source?.onerror?.(new Event('error')));
      expect(screen.queryByText(/Live updates are offline/)).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(FakeEventSource.instances).toHaveLength(2);
      act(() => FakeEventSource.instances[1]?.onerror?.(new Event('error')));
      expect(await screen.findByText(/Live updates are offline/)).toBeVisible();

      act(() => FakeEventSource.instances[1]?.emit('ready', {}));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(FakeEventSource.instances).toHaveLength(3);
      act(() => FakeEventSource.instances[2]?.emit('ready', {}));
      await waitFor(() =>
        expect(screen.queryByText(/Live updates are offline/)).not.toBeInTheDocument(),
      );

      await userEvent
        .setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) })
        .click(screen.getByRole('button', { name: 'Dismiss order #43' }));
      expect(screen.queryByText('New order #43')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
