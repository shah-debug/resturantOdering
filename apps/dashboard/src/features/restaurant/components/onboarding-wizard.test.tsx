import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { MembershipRole, OnboardingStatus } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import {
  type ApiCall,
  BRANCH_ID,
  branchFixture,
  meFixture,
  mockApi,
  ORGANIZATION_ID,
  onboardingFixture,
  organizationFixture,
} from '@/testing/api-mock';
import { OnboardingWizard } from './onboarding-wizard';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const base = `/organizations/${ORGANIZATION_ID}`;

function setup({
  role = 'OWNER',
  onboarding = onboardingFixture(),
  step,
  extra,
}: {
  role?: MembershipRole;
  onboarding?: OnboardingStatus;
  step?: string;
  extra?: (call: ApiCall) => Response | undefined;
}) {
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me') return jsonResponse(meFixture(role));
    if (call.path === base) return jsonResponse(organizationFixture());
    if (call.path === `${base}/onboarding`) return jsonResponse(onboarding);
    if (call.path === `${base}/branches/${BRANCH_ID}`) return jsonResponse(branchFixture());
    return undefined;
  });
  renderWithStore(<OnboardingWizard organizationId={ORGANIZATION_ID} step={step} />, makeStore());
  return api;
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    navigation.push.mockClear();
  });

  it('resumes at the first incomplete step and shows saved steps', async () => {
    setup({ onboarding: onboardingFixture(['restaurant', 'profile']) });

    expect(await screen.findByRole('heading', { name: 'Location' })).toBeInTheDocument();
    const progress = screen.getByRole('list', { name: 'Setup progress' });
    const items = within(progress).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(items[1]).toHaveTextContent('ProfileSaved');
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).toHaveTextContent('LocationCurrent step');
    expect(items[3]).toHaveTextContent('Opening hoursNot started');
    expect(screen.getByLabelText('Location name')).toHaveValue('Karachi Grill');
  });

  it('creates the first branch and moves on to opening hours', async () => {
    const { calls } = setup({
      step: 'branch',
      extra: (call) => (call.method === 'POST' ? jsonResponse(branchFixture(), 201) : undefined),
    });

    await screen.findByRole('heading', { name: 'Location' });
    await userEvent.type(screen.getByLabelText('Branch phone'), '+923001234567');
    await userEvent.type(screen.getByLabelText('Address line'), 'Plot 12, Block 5');
    await userEvent.type(screen.getByLabelText('City'), 'Karachi');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    await vi.waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(`${base}/onboarding?step=hours`),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: `${base}/branches`,
        body: {
          name: 'Karachi Grill',
          phone: '+923001234567',
          addressLine: 'Plot 12, Block 5',
          area: null,
          city: 'Karachi',
        },
      }),
    );
  });

  it('shows a read-only notice instead of forms to kitchen staff', async () => {
    setup({ role: 'KITCHEN_STAFF', step: 'profile' });

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(await screen.findByText('View only')).toBeInTheDocument();
    expect(screen.queryByLabelText('Restaurant name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save and continue' })).not.toBeInTheDocument();
  });

  it('only allows completing setup when the server says it can', async () => {
    setup({
      step: 'review',
      onboarding: onboardingFixture(['restaurant', 'profile', 'branch'], {
        primaryBranchId: BRANCH_ID,
        checks: [
          {
            id: 'hours',
            label: 'Opening hours',
            status: 'missing',
            step: 'hours',
            detail: 'Add at least one opening period',
          },
          { id: 'menu', label: 'Menu', status: 'upcoming', step: null, detail: null },
        ],
      }),
    });

    expect(await screen.findByRole('heading', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete setup' })).toBeDisabled();
    expect(
      within(screen.getByRole('region', { name: 'Needs attention' })).getByRole('link', {
        name: 'Go to Opening hours',
      }),
    ).toHaveAttribute('href', `${base}/onboarding?step=hours`);
    expect(
      within(screen.getByRole('region', { name: 'Coming next' })).getByText('Menu'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Storefront preview' })).getByText(
        'Plot 12, Block 5, Clifton, Karachi',
      ),
    ).toBeInTheDocument();
  });

  it('completes setup and opens the overview', async () => {
    const { calls } = setup({
      step: 'review',
      onboarding: onboardingFixture(['restaurant', 'profile', 'branch', 'hours', 'fulfillment'], {
        primaryBranchId: BRANCH_ID,
        canComplete: true,
      }),
      extra: (call) =>
        call.method === 'POST'
          ? jsonResponse(onboardingFixture([], { completedAt: '2026-02-01T00:00:00.000Z' }))
          : undefined,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Complete setup' }));

    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(base));
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'POST', path: `${base}/onboarding/complete` }),
    );
  });
});
