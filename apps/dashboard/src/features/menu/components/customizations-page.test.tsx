import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { AddOnGroup, MembershipRole } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import {
  type ApiCall,
  errorResponse,
  meFixture,
  mockApi,
  ORGANIZATION_ID,
} from '@/testing/api-mock';
import { addOnGroupFixture, GROUP_IDS } from '@/testing/menu-fixtures';
import { CustomizationsPage } from './customizations-page';

const groupsPath = `/organizations/${ORGANIZATION_ID}/menu/add-on-groups`;

function setup({
  role = 'OWNER',
  groups = [
    addOnGroupFixture(),
    addOnGroupFixture({
      id: GROUP_IDS[1],
      name: 'Extra toppings',
      minSelect: 0,
      maxSelect: 3,
      productCount: 1,
    }),
  ],
  extra,
}: {
  role?: MembershipRole;
  groups?: AddOnGroup[];
  extra?: (call: ApiCall) => Response | undefined;
} = {}) {
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me') return jsonResponse(meFixture(role));
    if (call.path === groupsPath && call.method === 'GET') return jsonResponse(groups);
    return undefined;
  });
  renderWithStore(<CustomizationsPage organizationId={ORGANIZATION_ID} />, makeStore());
  return api;
}

function option(index: number) {
  return within(screen.getByRole('group', { name: `Option ${index}` }));
}

describe('CustomizationsPage', () => {
  it('summarises each group', async () => {
    setup();

    expect(screen.getByRole('heading', { name: 'Customizations' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Customization groups' });
    expect(within(list).getByText('Required: choose 1')).toBeInTheDocument();
    expect(within(list).getByText('Optional: up to 3')).toBeInTheDocument();
    expect(within(list).getByText('Used by 3 products')).toBeInTheDocument();
    expect(within(list).getAllByText('2 options')).toHaveLength(2);
  });

  it('rejects a minimum above the maximum', async () => {
    const { calls } = setup();

    await userEvent.click(await screen.findByRole('button', { name: 'New customization group' }));
    await userEvent.type(screen.getByLabelText('Group name'), 'Sauces');
    await userEvent.type(option(1).getByLabelText('Option name'), 'Mint');
    await userEvent.click(screen.getByRole('button', { name: 'Add option' }));
    await userEvent.type(option(2).getByLabelText('Option name'), 'Garlic');
    await userEvent.click(screen.getByRole('switch', { name: 'Required' }));
    await userEvent.clear(screen.getByLabelText('Minimum choices'));
    await userEvent.type(screen.getByLabelText('Minimum choices'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save group' }));

    expect(screen.getByLabelText('Minimum choices')).toHaveAccessibleDescription(
      expect.stringContaining('Minimum cannot exceed maximum'),
    );
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('rejects a required group with no available options', async () => {
    const { calls } = setup();

    await userEvent.click(await screen.findByRole('button', { name: 'New customization group' }));
    await userEvent.type(screen.getByLabelText('Group name'), 'Sauces');
    await userEvent.type(option(1).getByLabelText('Option name'), 'Mint');
    await userEvent.click(option(1).getByRole('switch', { name: 'Available' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Required' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save group' }));

    expect(screen.getByLabelText('Minimum choices')).toHaveAccessibleDescription(
      expect.stringContaining('Not enough available options to meet the minimum'),
    );
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('creates a group with prices in paisa and shows a name conflict', async () => {
    const { calls } = setup({
      extra: (call) =>
        call.method === 'POST'
          ? errorResponse(409, 'CONFLICT', 'A group with this name already exists', [
              { field: 'name', message: 'A group with this name already exists' },
            ])
          : undefined,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'New customization group' }));
    await userEvent.type(screen.getByLabelText('Group name'), 'Choose a drink');
    await userEvent.type(option(1).getByLabelText('Option name'), 'Lassi');
    await userEvent.clear(option(1).getByLabelText('Price (Rs)'));
    await userEvent.type(option(1).getByLabelText('Price (Rs)'), '120.5');
    await userEvent.click(screen.getByRole('switch', { name: 'Required' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save group' }));

    await vi.waitFor(() =>
      expect(screen.getByLabelText('Group name')).toHaveAccessibleDescription(
        'A group with this name already exists',
      ),
    );
    expect(calls.find((call) => call.method === 'POST')).toMatchObject({
      path: groupsPath,
      body: {
        name: 'Choose a drink',
        minSelect: 1,
        maxSelect: 1,
        addOns: [{ name: 'Lassi', priceMinor: 12050, isAvailable: true }],
      },
    });
  });

  it('deletes a group only after confirmation', async () => {
    const { calls } = setup({
      extra: (call) => (call.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Choose a drink' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Choose a drink?' });
    expect(dialog).toHaveTextContent('It will be removed from 3 products.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete group' }));

    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({ method: 'DELETE', path: `${groupsPath}/${GROUP_IDS[0]}` }),
      ),
    );
  });

  it('shows an empty state and hides editing from order staff', async () => {
    setup({ role: 'ORDER_STAFF', groups: [] });

    expect(await screen.findByText('No customization groups yet')).toBeInTheDocument();
    expect(await screen.findByText('View only')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New customization group' }),
    ).not.toBeInTheDocument();
  });
});
