import type {
  BillingOverview,
  MembershipRole,
  PlatformPayment,
  SubscriptionState,
} from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { AuthGate } from '@/components/shell/session';
import { PaymentsReviewPage } from '@/features/platform/components/payments-review-page';
import { PlatformShell } from '@/features/platform/components/platform-shell';
import { makeStore } from '@/store/store';
import {
  type ApiCall,
  errorResponse,
  meFixture,
  mockApi,
  ORGANIZATION_ID,
} from '@/testing/api-mock';
import { billingNotice } from './billing-text';
import { BillingBanner } from './components/billing-banner';
import { BillingPage } from './components/billing-page';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/platform/billing',
}));

const INVOICE_ID = '018f0000-0000-7000-8000-000000000301';
const PAYMENT_ID = '018f0000-0000-7000-8000-000000000302';
const NOW = Date.parse('2026-11-01T10:00:00Z');

function state(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return {
    standing: 'good',
    canTakeOrders: true,
    status: 'TRIALING',
    planName: 'Starter',
    trialEndsAt: '2026-11-04T19:00:00.000Z',
    currentPeriodEnd: '2026-11-04T19:00:00.000Z',
    graceEndsAt: null,
    suspendedAt: null,
    cancelAtPeriodEnd: false,
    timezone: 'Asia/Karachi',
    usage: [
      { resource: 'branches', used: 1, limit: 1 },
      { resource: 'products', used: 3, limit: 50 },
      { resource: 'riders', used: 0, limit: null },
      { resource: 'members', used: 2, limit: 5 },
    ],
    ...overrides,
  };
}

function overview(overrides: Partial<BillingOverview> = {}): BillingOverview {
  return {
    state: state(),
    subscription: {
      id: '018f0000-0000-7000-8000-000000000303',
      planId: '018f0000-0000-7000-8000-000000000304',
      planCode: 'starter',
      planName: 'Starter',
      status: 'TRIALING',
      priceMinor: 300_000,
      currency: 'PKR',
      billingInterval: 'MONTHLY',
      currentPeriodStart: '2026-10-21T19:00:00.000Z',
      currentPeriodEnd: '2026-11-04T19:00:00.000Z',
      trialEndsAt: '2026-11-04T19:00:00.000Z',
      graceEndsAt: null,
      suspendedAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      expiredAt: null,
      createdAt: '2026-10-22T10:00:00.000Z',
    },
    invoices: [
      {
        id: INVOICE_ID,
        number: 'INV-000042',
        periodStart: '2026-11-04T19:00:00.000Z',
        periodEnd: '2026-12-04T19:00:00.000Z',
        amountMinor: 300_000,
        currency: 'PKR',
        status: 'OPEN',
        dueAt: '2026-11-04T19:00:00.000Z',
        paidAt: null,
        verifiedMinor: 0,
        pendingMinor: 0,
      },
    ],
    payments: [],
    paymentInstructions: 'Meezan Bank\nAccount 0101-0000000',
    ...overrides,
  };
}

function renderBilling(
  role: MembershipRole,
  extra?: (call: ApiCall) => Response | undefined,
  data = overview(),
) {
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me') return jsonResponse(meFixture(role));
    if (call.path === `/organizations/${ORGANIZATION_ID}/billing`) return jsonResponse(data);
    return undefined;
  });
  renderWithStore(<BillingPage organizationId={ORGANIZATION_ID} />, makeStore());
  return api;
}

describe('billing notices', () => {
  it('explains each subscription state without blaming data loss', () => {
    expect(billingNotice(state(), NOW)?.title).toBe('Your free trial ends on 05-Nov-2026');
    expect(billingNotice(state({ trialEndsAt: '2026-12-30T19:00:00.000Z' }), NOW)).toBeNull();
    expect(
      billingNotice(
        state({ standing: 'grace', status: 'PAST_DUE', graceEndsAt: '2026-11-08T19:00:00.000Z' }),
        NOW,
      ),
    ).toMatchObject({ tone: 'warning', detail: expect.stringContaining('09-Nov-2026') as unknown });
    expect(
      billingNotice(state({ standing: 'restricted', status: 'SUSPENDED' }), NOW),
    ).toMatchObject({
      tone: 'danger',
      title: 'Online ordering is paused',
      detail: expect.stringContaining('data are kept') as unknown,
    });
    expect(billingNotice(state({ standing: 'unmanaged', status: null }), NOW)).toBeNull();
  });
});

describe('BillingPage', () => {
  it('shows the plan, local dates, usage and how to pay', async () => {
    renderBilling('OWNER');
    expect(await screen.findByRole('heading', { name: 'Starter' })).toBeVisible();
    expect(screen.getByText('Free trial')).toBeVisible();
    expect(screen.getAllByText('05-Nov-2026').length).toBeGreaterThan(0);
    expect(screen.getByRole('row', { name: /branches 1 of 1 \(limit reached\)/i })).toBeVisible();
    expect(screen.getByRole('row', { name: /riders 0 of unlimited/i })).toBeVisible();
    expect(screen.getByText(/Meezan Bank/)).toBeVisible();
  });

  it('validates and submits a payment with a receipt', async () => {
    const user = userEvent.setup();
    const { calls } = renderBilling('OWNER', (call) =>
      call.method === 'POST'
        ? jsonResponse(
            {
              id: PAYMENT_ID,
              invoiceId: INVOICE_ID,
              invoiceNumber: 'INV-000042',
              method: 'JAZZCASH',
              amountMinor: 300_000,
              currency: 'PKR',
              reference: 'JC-9988',
              paidOn: '2026-11-01',
              note: null,
              hasEvidence: true,
              status: 'SUBMITTED',
              submittedAt: '2026-11-01T10:00:00.000Z',
              submittedBy: 'Ayesha Khan',
              reviewedAt: null,
              rejectionReason: null,
            },
            201,
          )
        : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Submit payment details' }));
    expect(screen.getByLabelText('Transaction or receipt number')).toHaveAccessibleDescription(
      'Enter the transaction or receipt number',
    );
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await user.selectOptions(screen.getByLabelText('Paid with'), 'JAZZCASH');
    await user.type(screen.getByLabelText('Transaction or receipt number'), 'JC-9988');
    await user.upload(
      screen.getByLabelText('Receipt (optional)'),
      new File(['receipt'], 'receipt.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Submit payment details' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    const form = calls.find((call) => call.method === 'POST')?.body as FormData;
    expect(form.get('invoiceId')).toBe(INVOICE_ID);
    expect(form.get('method')).toBe('JAZZCASH');
    expect(form.get('reference')).toBe('JC-9988');
    expect(form.get('amountMinor')).toBe('300000');
    expect(form.get('evidence')).toBeInstanceOf(File);
    expect(await screen.findByText('Payment recorded')).toBeVisible();
  });

  it('shows the server explanation for a repeated reference', async () => {
    const user = userEvent.setup();
    renderBilling('OWNER', (call) =>
      call.method === 'POST'
        ? errorResponse(409, 'CONFLICT', 'This payment reference has already been submitted.', [
            { field: 'reference', message: 'This reference has already been submitted' },
          ])
        : undefined,
    );
    await user.type(await screen.findByLabelText('Transaction or receipt number'), 'TXN-1234');
    await user.click(screen.getByRole('button', { name: 'Submit payment details' }));
    expect(await screen.findByText('This reference has already been submitted')).toBeVisible();
  });

  it('lets managers read but not record payments, and shows review outcomes', async () => {
    renderBilling(
      'MANAGER',
      undefined,
      overview({
        payments: [
          {
            id: PAYMENT_ID,
            invoiceId: INVOICE_ID,
            invoiceNumber: 'INV-000042',
            method: 'BANK_TRANSFER',
            amountMinor: 300_000,
            currency: 'PKR',
            reference: 'TXN-1',
            paidOn: '2026-10-30',
            note: null,
            hasEvidence: false,
            status: 'REJECTED',
            submittedAt: '2026-10-30T10:00:00.000Z',
            submittedBy: 'Ayesha Khan',
            reviewedAt: '2026-10-31T10:00:00.000Z',
            rejectionReason: 'No matching bank credit',
          },
        ],
      }),
    );
    expect(await screen.findByText('Only the restaurant owner can record payments.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Submit payment details' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Reason: No matching bank credit')).toBeVisible();
  });
});

describe('BillingBanner', () => {
  it('tells staff that ordering is paused and where to look', async () => {
    mockApi((call) =>
      call.path.endsWith('/subscription')
        ? jsonResponse(state({ standing: 'restricted', canTakeOrders: false, status: 'SUSPENDED' }))
        : undefined,
    );
    renderWithStore(
      <BillingBanner organizationId={ORGANIZATION_ID} canSeeBilling={false} />,
      makeStore(),
    );
    expect(await screen.findByText('Online ordering is paused')).toBeVisible();
    expect(screen.getByText('Ask the restaurant owner to check the Billing page.')).toBeVisible();
  });
});

function platformPayment(overrides: Partial<PlatformPayment> = {}): PlatformPayment {
  return {
    id: PAYMENT_ID,
    invoiceId: INVOICE_ID,
    invoiceNumber: 'INV-000042',
    method: 'BANK_TRANSFER',
    amountMinor: 250_000,
    currency: 'PKR',
    reference: 'TXN-777',
    paidOn: '2026-11-01',
    note: 'Paid from the business account',
    hasEvidence: true,
    status: 'SUBMITTED',
    submittedAt: '2026-11-01T10:00:00.000Z',
    submittedBy: 'Ayesha Khan',
    reviewedAt: null,
    rejectionReason: null,
    organizationId: ORGANIZATION_ID,
    organizationName: 'Karachi Grill',
    invoiceAmountMinor: 300_000,
    invoiceStatus: 'OPEN',
    subscriptionStatus: 'PAST_DUE',
    submittedByEmail: 'owner@example.pk',
    reviewedBy: null,
    ...overrides,
  };
}

function renderQueue(
  platformRole: 'SUPPORT' | 'SUPER_ADMIN',
  extra?: (call: ApiCall) => Response | undefined,
) {
  const me = meFixture();
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me')
      return jsonResponse({ ...me, user: { ...me.user, platformRole } });
    if (call.path === '/platform/billing/payments') {
      return jsonResponse({ items: [platformPayment()], page: 1, pageSize: 20, total: 1 });
    }
    return undefined;
  });
  const ui: ReactNode = (
    <AuthGate>
      <PlatformShell>
        <PaymentsReviewPage />
      </PlatformShell>
    </AuthGate>
  );
  renderWithStore(ui, makeStore());
  return api;
}

describe('PaymentsReviewPage', () => {
  it('shows support the evidence but no approval buttons', async () => {
    renderQueue('SUPPORT');
    expect(await screen.findByText('TXN-777')).toBeVisible();
    expect(screen.getByText('less than the invoice')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View receipt' })).toHaveAttribute(
      'href',
      `/api/v1/platform/billing/payments/${PAYMENT_ID}/evidence`,
    );
    expect(screen.queryByRole('button', { name: 'Verify payment' })).not.toBeInTheDocument();
  });

  it('lets a super admin verify, and requires a reason to reject', async () => {
    const user = userEvent.setup();
    const { calls } = renderQueue('SUPER_ADMIN', (call) =>
      call.path.endsWith('/review')
        ? jsonResponse(platformPayment({ status: 'VERIFIED' }))
        : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Reject payment' }));
    expect(dialog.getByText(/Explain why/)).toBeVisible();
    expect(calls.some((call) => call.path.endsWith('/review'))).toBe(false);
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Verify payment' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/review'))?.body).toEqual({
        decision: 'VERIFY',
      }),
    );
  });

  it('shows the four-eyes rule from the server', async () => {
    const user = userEvent.setup();
    renderQueue('SUPER_ADMIN', (call) =>
      call.path.endsWith('/review')
        ? errorResponse(
            409,
            'CONFLICT',
            'You submitted this payment, so another administrator must review it.',
          )
        : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Verify payment' }));
    expect(await screen.findByText(/another administrator must review it/)).toBeVisible();
  });
});
