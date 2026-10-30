import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MembershipRole } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import {
  type ApiCall,
  BRANCH_ID,
  branchFixture,
  errorResponse,
  meFixture,
  mockApi,
  ORGANIZATION_ID,
} from '@/testing/api-mock';
import { RIDER_ID, riderFixture } from '@/testing/order-fixtures';
import { RidersPage } from './riders-page';

const RIDERS = `/organizations/${ORGANIZATION_ID}/riders`;

function setup(role: MembershipRole, extra?: (call: ApiCall) => Response | undefined) {
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me') return jsonResponse(meFixture(role));
    if (call.path.endsWith('/branches')) return jsonResponse([branchFixture({ id: BRANCH_ID })]);
    if (call.path === RIDERS && call.method === 'GET') return jsonResponse([riderFixture()]);
    return undefined;
  });
  renderWithStore(<RidersPage organizationId={ORGANIZATION_ID} />, makeStore());
  return api;
}

describe('RidersPage', () => {
  it('lists riders with their branch and availability', async () => {
    setup('OWNER');
    expect(await screen.findByText('Imran Khan')).toBeVisible();
    expect(screen.getByText('Available')).toBeVisible();
    expect(screen.getByText(/\+923001110001 · Motorcycle LEA-1234 · Gulberg/)).toBeVisible();
  });

  it('adds a rider with a normalised phone number', async () => {
    const user = userEvent.setup();
    const { calls } = setup('MANAGER', (call) =>
      call.path === RIDERS && call.method === 'POST'
        ? jsonResponse(riderFixture({ fullName: 'Sana Rafiq' }), 201)
        : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Add rider' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Add rider' }));
    expect(dialog.getByText('Enter the rider’s name')).toBeVisible();
    expect(dialog.getByText('Enter a valid mobile number, e.g. 0300 1234567')).toBeVisible();

    await user.type(dialog.getByLabelText('Full name'), 'Sana Rafiq');
    await user.type(dialog.getByLabelText('Mobile number'), '0321 7654321');
    await user.type(dialog.getByLabelText('Number plate (optional)'), 'lhr-99');
    await user.click(dialog.getByRole('button', { name: 'Add rider' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
        branchId: BRANCH_ID,
        fullName: 'Sana Rafiq',
        phone: '+923217654321',
        vehicleType: 'MOTORCYCLE',
        vehicleNumber: 'lhr-99',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('explains why a busy rider cannot be deactivated', async () => {
    const user = userEvent.setup();
    setup('OWNER', (call) =>
      call.path === `${RIDERS}/${RIDER_ID}` && call.method === 'PATCH'
        ? errorResponse(
            409,
            'CONFLICT',
            'This rider is out on a delivery. Finish the delivery first.',
          )
        : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText(/out on a delivery/)).toBeVisible();
  });

  it('is read-only for order staff', async () => {
    setup('ORDER_STAFF');
    expect(await screen.findByText('Imran Khan')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add rider' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });
});
