import type { MeResponse, PlatformOrganizationDetail, PlatformRole } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { AuthGate } from '@/components/shell/session';
import { makeStore } from '@/store/store';
import { type ApiCall, meFixture, mockApi } from '@/testing/api-mock';
import { PlatformShell } from './components/platform-shell';
import { RestaurantDetailPage } from './components/restaurant-detail-page';
import { RestaurantsPage } from './components/restaurants-page';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/platform/restaurants',
}));

const RESTAURANT_ID = '018f0000-0000-7000-8000-000000000101';

function me(platformRole: PlatformRole | null): MeResponse {
  const base = meFixture();
  return { ...base, user: { ...base.user, platformRole } };
}

const listItem = {
  id: RESTAURANT_ID,
  name: 'Karachi Grill',
  slug: 'karachi-grill',
  status: 'ACTIVE' as const,
  createdAt: '2026-10-01T00:00:00.000Z',
  onboardingCompletedAt: '2026-10-02T00:00:00.000Z',
  owner: { fullName: 'Ayesha Khan', email: 'owner@example.pk' },
  branchCount: 2,
  ordersLast30Days: 120,
  subscription: null,
};

function detail(overrides: Partial<PlatformOrganizationDetail> = {}): PlatformOrganizationDetail {
  return {
    ...listItem,
    description: null,
    contactEmail: 'hello@example.pk',
    contactPhone: '+923001234567',
    timezone: 'Asia/Karachi',
    memberCount: 4,
    branches: [],
    subscriptions: [],
    activity: {
      ordersLast30Days: 120,
      completedLast30Days: 110,
      lastOrderAt: '2026-10-30T10:00:00.000Z',
    },
    recentAudit: [
      {
        id: '018f0000-0000-7000-8000-000000000202',
        action: 'platform.organization_status_changed',
        entityType: 'organization',
        entityId: RESTAURANT_ID,
        organizationId: RESTAURANT_ID,
        organizationName: 'Karachi Grill',
        actor: { fullName: 'Admin', email: 'admin@platform.pk' },
        changes: { from: 'SUSPENDED', to: 'ACTIVE', reason: 'Paid' },
        ipAddress: null,
        createdAt: '2026-10-29T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function render(
  role: PlatformRole | null,
  ui: ReactNode,
  extra?: (call: ApiCall) => Response | undefined,
) {
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me') return jsonResponse(me(role));
    if (call.path === '/platform/organizations') {
      return jsonResponse({ items: [listItem], page: 1, pageSize: 20, total: 1 });
    }
    if (call.path === `/platform/organizations/${RESTAURANT_ID}`) return jsonResponse(detail());
    if (call.path === '/platform/plans') return jsonResponse([]);
    return undefined;
  });
  renderWithStore(
    <AuthGate>
      <PlatformShell>{ui}</PlatformShell>
    </AuthGate>,
    makeStore(),
  );
  return api;
}

describe('platform admin', () => {
  it('blocks users without a platform role', async () => {
    const { calls } = render(null, <RestaurantsPage />);
    expect(await screen.findByText('Platform access required')).toBeVisible();
    expect(calls.some((call) => call.path.startsWith('/platform'))).toBe(false);
  });

  it('lists and searches restaurants, with export only for super admins', async () => {
    const user = userEvent.setup();
    const { calls } = render('SUPPORT', <RestaurantsPage />);
    expect(await screen.findByRole('link', { name: 'Karachi Grill' })).toBeVisible();
    expect(screen.getByText('owner@example.pk')).toBeVisible();
    expect(screen.queryByRole('link', { name: /Export CSV/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Search'), 'grill');
    await user.selectOptions(screen.getByLabelText('Status'), 'SUSPENDED');
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path === '/platform/organizations' &&
            call.search.includes('search=grill') &&
            call.search.includes('status=SUSPENDED'),
        ),
      ).toBe(true),
    );
  });

  it('shows support a read-only restaurant', async () => {
    render('SUPPORT', <RestaurantDetailPage organizationId={RESTAURANT_ID} />);
    expect(await screen.findByRole('heading', { name: 'Karachi Grill' })).toBeVisible();
    expect(
      screen.getByText('Support staff can view restaurants but not change them.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(screen.getByText('platform.organization_status_changed')).toBeVisible();
  });

  it('requires a reason before a super admin suspends a restaurant', async () => {
    const user = userEvent.setup();
    const { calls } = render(
      'SUPER_ADMIN',
      <RestaurantDetailPage organizationId={RESTAURANT_ID} />,
      (call) =>
        call.path.endsWith('/status') ? jsonResponse(detail({ status: 'SUSPENDED' })) : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Suspend' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Suspend' }));
    expect(dialog.getByText(/Give a reason of at least 5 characters/)).toBeVisible();
    expect(calls.some((call) => call.path.endsWith('/status'))).toBe(false);
    await user.type(dialog.getByLabelText('Reason'), 'Unpaid invoices since September');
    await user.click(dialog.getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/status'))?.body).toEqual({
        status: 'SUSPENDED',
        expectedStatus: 'ACTIVE',
        reason: 'Unpaid invoices since September',
      }),
    );
  });
});
