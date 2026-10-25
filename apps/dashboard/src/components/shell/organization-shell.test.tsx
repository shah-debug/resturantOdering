import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { MeResponse } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import {
  type ApiCall,
  errorResponse,
  meFixture,
  mockApi,
  ORGANIZATION_ID,
  onboardingFixture,
  organizationFixture,
  withSecondMembership,
} from '@/testing/api-mock';
import { OrganizationShell } from './organization-shell';
import { AuthGate } from './session';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => `/organizations/${ORGANIZATION_ID}/settings`,
}));

const base = `/organizations/${ORGANIZATION_ID}`;

function setup(me: MeResponse, extra?: (call: ApiCall) => Response | undefined) {
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me') return jsonResponse(me);
    if (call.path === base) return jsonResponse(organizationFixture());
    if (call.path === `${base}/onboarding`) {
      return jsonResponse(onboardingFixture(['restaurant', 'profile']));
    }
    return undefined;
  });
  renderWithStore(
    <AuthGate>
      <OrganizationShell organizationId={ORGANIZATION_ID}>
        <p>Page body</p>
      </OrganizationShell>
    </AuthGate>,
    makeStore(),
  );
  return api;
}

describe('OrganizationShell', () => {
  beforeEach(() => {
    navigation.replace.mockClear();
  });

  it('renders the main navigation, breadcrumbs and setup progress', async () => {
    setup(meFixture('OWNER'));

    expect(await screen.findByText('Page body')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', base);
    expect(
      await within(nav).findByRole('link', { name: 'Setup 2 of 6 steps complete' }),
    ).toHaveAttribute('href', `${base}/onboarding`);
    expect(within(nav).getByRole('link', { name: 'Team' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Menu' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const breadcrumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumbs).getByRole('link', { name: 'Karachi Grill' })).toHaveAttribute(
      'href',
      base,
    );
    expect(within(breadcrumbs).getByText('Settings')).toHaveAttribute('aria-current', 'page');
  });

  it('hides team and settings from kitchen staff', async () => {
    setup(meFixture('KITCHEN_STAFF'));

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Team' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Menu' })).toHaveAttribute('href', `${base}/menu`);
  });

  it('hides the menu from riders', async () => {
    setup(meFixture('RIDER'));

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('hides the restaurant switcher with a single membership', async () => {
    setup(meFixture());

    await screen.findByText('Page body');
    expect(screen.queryByRole('button', { name: 'Switch restaurant' })).not.toBeInTheDocument();
  });

  it('lets members of several restaurants switch between them', async () => {
    setup(withSecondMembership(meFixture()));

    const switcher = await screen.findByRole('button', { name: 'Switch restaurant' });
    await userEvent.click(switcher);

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Lahore Tikka House/ })).toHaveAttribute(
      'href',
      '/organizations/99999999-9999-4999-8999-999999999999',
    );
  });

  it('opens the navigation in a sheet on small screens', async () => {
    setup(meFixture());

    await userEvent.click(await screen.findByRole('button', { name: 'Open navigation' }));

    const dialog = await screen.findByRole('dialog', { name: 'Karachi Grill' });
    const nav = within(dialog).getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^Setup/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Team' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Settings' })).toBeInTheDocument();

    await userEvent.click(within(nav).getByRole('link', { name: 'Overview' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('signs out of all devices from the account menu', async () => {
    const { calls } = setup(meFixture(), (call) =>
      call.path === '/auth/logout-all' ? new Response(null, { status: 204 }) : undefined,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('owner@example.pk')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Change password' })).toHaveAttribute(
      'href',
      '/account/password',
    );
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out of all devices' }));

    await vi.waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login'));
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'POST', path: '/auth/logout-all' }),
    );
  });

  it('shows a not-found state for an unknown restaurant', async () => {
    setup(meFixture(), (call) =>
      call.path === base ? errorResponse(404, 'NOT_FOUND', 'Organization not found') : undefined,
    );

    expect(await screen.findByRole('heading', { name: 'Restaurant not found' })).toBeVisible();
    expect(screen.queryByText('Page body')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your restaurants' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('recovers from a failed load with Retry', async () => {
    let failures = 1;
    setup(meFixture(), (call) => {
      if (call.path === base && failures > 0) {
        failures -= 1;
        return errorResponse(500, 'INTERNAL_ERROR', 'The kitchen is on fire');
      }
      return undefined;
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The kitchen is on fire');
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Page body')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('redirects to sign in when the session has expired', async () => {
    mockApi(() => errorResponse(401, 'UNAUTHENTICATED', 'Sign in to continue'));
    renderWithStore(
      <AuthGate>
        <p>Page body</p>
      </AuthGate>,
      makeStore(),
    );

    await vi.waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        `/login?next=${encodeURIComponent(`${base}/settings`)}`,
      ),
    );
  });
});
