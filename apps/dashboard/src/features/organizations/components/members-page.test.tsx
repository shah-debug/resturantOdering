import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { Member, MembershipRole } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import {
  type ApiCall,
  errorResponse,
  meFixture,
  mockApi,
  ORGANIZATION_ID,
  USER_ID,
} from '@/testing/api-mock';
import { MembersPage } from './members-page';

function member(overrides: Partial<Member> & Pick<Member, 'membershipId' | 'fullName'>): Member {
  return {
    userId: '44444444-4444-4444-8444-444444444444',
    email: `${overrides.fullName.split(' ')[0]?.toLowerCase()}@example.pk`,
    role: 'ORDER_STAFF',
    status: 'ACTIVE',
    branchId: null,
    invitedAt: '2026-01-01T00:00:00.000Z',
    acceptedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

const members: Member[] = [
  member({
    membershipId: '33333333-3333-4333-8333-333333333333',
    userId: USER_ID,
    fullName: 'Ayesha Khan',
    role: 'OWNER',
  }),
  member({ membershipId: '55555555-5555-4555-8555-555555555555', fullName: 'Bilal Ahmed' }),
  member({
    membershipId: '66666666-6666-4666-8666-666666666666',
    fullName: 'Sana Rafiq',
    role: 'RIDER',
    status: 'SUSPENDED',
  }),
];

function setup(
  role: MembershipRole,
  items: Member[],
  extra?: (call: ApiCall) => Response | undefined,
) {
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me') return jsonResponse(meFixture(role));
    if (call.path === `/organizations/${ORGANIZATION_ID}/members` && call.method === 'GET') {
      return jsonResponse({ items, page: 1, pageSize: 20, total: items.length });
    }
    return undefined;
  });
  renderWithStore(<MembersPage organizationId={ORGANIZATION_ID} />, makeStore());
  return api;
}

describe('MembersPage', () => {
  it('renders a row per member with management controls for an owner', async () => {
    setup('OWNER', members);

    const table = await screen.findByRole('table', { name: 'Team members' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('Bilal Ahmed')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1 · 3 members')).toBeInTheDocument();

    expect(screen.getByRole('combobox', { name: 'Role for Bilal Ahmed' })).toHaveValue(
      'ORDER_STAFF',
    );
    expect(screen.getByRole('button', { name: 'Suspend Bilal Ahmed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate Sana Rafiq' })).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Role for Ayesha Khan' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invite a team member' })).toBeInTheDocument();
  });

  it('shows an empty state when the organization has no members', async () => {
    setup('OWNER', []);

    expect(await screen.findByText('No team members yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('hides management controls from kitchen staff', async () => {
    setup('KITCHEN_STAFF', members);

    await screen.findByRole('table', { name: 'Team members' });
    expect(await screen.findByText('Your role: Kitchen staff')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Suspend|Reactivate|Remove/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Invite a team member' })).not.toBeInTheDocument();
  });

  it('limits a manager to staff roles', async () => {
    setup('MANAGER', [
      member({
        membershipId: '77777777-7777-4777-8777-777777777777',
        fullName: 'Omar Shah',
        role: 'MANAGER',
      }),
      members[1] as Member,
    ]);

    const roleSelect = await screen.findByRole('combobox', { name: 'Role for Bilal Ahmed' });
    expect(
      within(roleSelect)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Order staff', 'Kitchen staff', 'Rider']);
    expect(screen.queryByRole('combobox', { name: 'Role for Omar Shah' })).not.toBeInTheDocument();
  });

  it('asks for confirmation before removing a member', async () => {
    const { calls } = setup('OWNER', members, (call) =>
      call.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Bilal Ahmed' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));

    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: 'DELETE',
          path: `/organizations/${ORGANIZATION_ID}/members/55555555-5555-4555-8555-555555555555`,
        }),
      ),
    );
  });

  it('explains when the organization is not accessible', async () => {
    setup('OWNER', members, (call) =>
      call.path.endsWith('/members')
        ? errorResponse(403, 'FORBIDDEN', 'You do not have access to this organization')
        : undefined,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have access to this organization',
    );
    expect(screen.getByRole('link', { name: 'Back to your restaurants' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
