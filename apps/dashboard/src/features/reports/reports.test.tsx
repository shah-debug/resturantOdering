import type { SalesReport } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeStore } from '@/store/store';
import { branchFixture, mockApi, ORGANIZATION_ID, organizationFixture } from '@/testing/api-mock';
import { ReportsPage } from './components/reports-page';
import { presetRange, shiftDate, todayIn } from './date-range';

function report(overrides: Partial<SalesReport> = {}): SalesReport {
  return {
    range: {
      from: '2026-10-25',
      to: '2026-10-31',
      timezone: 'Asia/Karachi',
      startsAt: '2026-10-24T19:00:00.000Z',
      endsAt: '2026-10-31T19:00:00.000Z',
    },
    currency: 'PKR',
    orders: { placed: 12, completed: 9, cancelled: 2, rejected: 1, inProgress: 0 },
    sales: {
      grossOrderValueMinor: 1_350_000,
      discountsMinor: 20_000,
      deliveryChargesMinor: 90_000,
      taxMinor: 0,
      orderTotalsMinor: 1_420_000,
      refundsMinor: 50_000,
      estimatedNetSalesMinor: 1_280_000,
      averageOrderValueMinor: 157_778,
    },
    payments: { recordedMinor: 1_370_000, refundedMinor: 50_000, count: 9 },
    byType: [{ type: 'DELIVERY', completed: 9, totalMinor: 1_420_000 }],
    byPaymentMethod: [{ method: 'CASH', completed: 9, totalMinor: 1_420_000 }],
    daily: [
      { date: '2026-10-31', placed: 12, completed: 9, cancelled: 3, orderTotalsMinor: 1_420_000 },
    ],
    popularItems: [
      {
        productId: '018f0000-0000-7000-8000-0000000000aa',
        name: 'Chicken Karahi',
        quantity: 9,
        salesMinor: 1_350_000,
      },
    ],
    ...overrides,
  };
}

describe('date ranges', () => {
  it('uses the restaurant time zone for today', () => {
    const lateUtcEvening = new Date('2026-10-30T20:00:00Z');
    expect(todayIn('Asia/Karachi', lateUtcEvening)).toBe('2026-10-31');
    expect(todayIn('UTC', lateUtcEvening)).toBe('2026-10-30');
  });

  it('builds presets', () => {
    expect(presetRange('last7', '2026-10-31')).toEqual({ from: '2026-10-25', to: '2026-10-31' });
    expect(presetRange('yesterday', '2026-11-01')).toEqual({
      from: '2026-10-31',
      to: '2026-10-31',
    });
    expect(presetRange('thisMonth', '2026-10-31')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('ReportsPage', () => {
  function setup() {
    return mockApi((call) => {
      if (call.path === `/organizations/${ORGANIZATION_ID}`)
        return jsonResponse(organizationFixture());
      if (call.path.endsWith('/branches')) {
        return jsonResponse([
          branchFixture(),
          branchFixture({ id: '018f0000-0000-7000-8000-0000000000bb', name: 'DHA' }),
        ]);
      }
      if (call.path.endsWith('/reports/sales')) return jsonResponse(report());
      return undefined;
    });
  }

  it('shows real figures with their definitions and a not-profit notice', async () => {
    setup();
    renderWithStore(<ReportsPage organizationId={ORGANIZATION_ID} />, makeStore());
    expect(await screen.findByText('Rs 12,800')).toBeVisible();
    expect(screen.getByText('Estimated net sales')).toBeVisible();
    expect(screen.getByText(/This is not profit/)).toBeVisible();
    expect(screen.getByText(/These figures are sales, not profit/)).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Chicken Karahi' })).toBeVisible();
    expect(screen.getByText(/Days run midnight to midnight in Asia\/Karachi time/)).toBeVisible();
  });

  it('requests the chosen range and branch, and exports the same range', async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    renderWithStore(<ReportsPage organizationId={ORGANIZATION_ID} />, makeStore());
    await screen.findByText('Rs 12,800');
    await user.selectOptions(screen.getByLabelText('Period'), 'custom');
    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2026-10-01');
    await user.selectOptions(
      screen.getByLabelText('Branch'),
      '018f0000-0000-7000-8000-0000000000bb',
    );
    await waitFor(() => {
      const last = calls.filter((call) => call.path.endsWith('/reports/sales')).at(-1);
      expect(last?.search).toContain('from=2026-10-01');
      expect(last?.search).toContain('branchId=018f0000-0000-7000-8000-0000000000bb');
    });
    const link = screen.getByRole('link', { name: /Export orders/ });
    expect(link.getAttribute('href')).toContain(
      `/api/v1/organizations/${ORGANIZATION_ID}/reports/orders.csv?from=2026-10-01`,
    );
    expect(link.getAttribute('href')).toContain('branchId=018f0000-0000-7000-8000-0000000000bb');
  });

  it('shows a dash instead of an invented average when nothing was completed', async () => {
    mockApi((call) => {
      if (call.path === `/organizations/${ORGANIZATION_ID}`)
        return jsonResponse(organizationFixture());
      if (call.path.endsWith('/branches')) return jsonResponse([branchFixture()]);
      if (call.path.endsWith('/reports/sales')) {
        return jsonResponse(
          report({
            orders: { placed: 0, completed: 0, cancelled: 0, rejected: 0, inProgress: 0 },
            sales: { ...report().sales, averageOrderValueMinor: null },
            popularItems: [],
            byType: [],
            byPaymentMethod: [],
          }),
        );
      }
      return undefined;
    });
    renderWithStore(<ReportsPage organizationId={ORGANIZATION_ID} />, makeStore());
    expect(await screen.findByText('—')).toBeVisible();
    expect(screen.getAllByText('No completed orders in this period.').length).toBeGreaterThan(0);
  });
});
