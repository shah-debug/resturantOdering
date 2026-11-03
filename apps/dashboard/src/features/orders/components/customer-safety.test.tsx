import { jsonResponse, renderWithStore } from '@app/web/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeStore } from '@/store/store';
import { mockApi, ORGANIZATION_ID } from '@/testing/api-mock';
import { orderDetail } from '@/testing/order-fixtures';
import { CustomerSafety } from './customer-safety';

describe('CustomerSafety', () => {
  it('asks staff to confirm a first order and blocks a number only with a reason', async () => {
    const user = userEvent.setup();
    const order = orderDetail({ customerOrderCount: 1, customerPhone: '+923001234567' });
    const { calls } = mockApi((call) =>
      call.path.endsWith('/customer-block')
        ? jsonResponse({ ...order, customerBlocked: true })
        : undefined,
    );
    renderWithStore(<CustomerSafety organizationId={ORGANIZATION_ID} order={order} />, makeStore());
    expect(screen.getByText('First order from this number')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Block this number' }));
    await user.click(screen.getByRole('button', { name: 'Block number' }));
    expect(screen.getByText(/at least 5 characters/)).toBeVisible();
    expect(calls.some((call) => call.path.endsWith('/customer-block'))).toBe(false);

    await user.type(
      screen.getByLabelText('Why are you blocking this number?'),
      'Fake address twice',
    );
    await user.click(screen.getByRole('button', { name: 'Block number' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/customer-block'))?.body).toEqual({
        blocked: true,
        reason: 'Fake address twice',
      }),
    );
  });

  it('shows a blocked number and offers to unblock it', async () => {
    const user = userEvent.setup();
    const order = orderDetail({ customerBlocked: true, customerPhone: '+923001234567' });
    const { calls } = mockApi((call) =>
      call.path.endsWith('/customer-block')
        ? jsonResponse({ ...order, customerBlocked: false })
        : undefined,
    );
    renderWithStore(<CustomerSafety organizationId={ORGANIZATION_ID} order={order} />, makeStore());
    expect(screen.getByText('This number is blocked')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Unblock this number' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/customer-block'))?.body).toEqual({
        blocked: false,
      }),
    );
  });

  it('gives no block controls to staff who only see a masked number', () => {
    mockApi(() => undefined);
    renderWithStore(
      <CustomerSafety
        organizationId={ORGANIZATION_ID}
        order={orderDetail({ customerOrderCount: 4, customerPhone: '+92300••••567' })}
      />,
      makeStore(),
    );
    expect(screen.queryByRole('button', { name: 'Block this number' })).not.toBeInTheDocument();
    expect(screen.queryByText('First order from this number')).not.toBeInTheDocument();
  });
});
