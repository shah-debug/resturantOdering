import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { Branch } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import {
  BRANCH_ID,
  branchFixture,
  errorResponse,
  mockApi,
  ORGANIZATION_ID,
  organizationFixture,
} from '@/testing/api-mock';
import { FulfillmentForm } from './fulfillment-form';
import { OpeningHoursForm } from './opening-hours-form';
import { ProfileForm } from './profile-form';

const branchPath = `/organizations/${ORGANIZATION_ID}/branches/${BRANCH_ID}`;

async function fill(label: string, value: string) {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.paste(value);
}

describe('ProfileForm', () => {
  it('validates the logo URL and phone on the client', async () => {
    const { fetchMock } = mockApi(() => undefined);
    const onSaved = vi.fn();
    renderWithStore(
      <ProfileForm organization={organizationFixture()} mode="onboarding" onSaved={onSaved} />,
      makeStore(),
    );

    expect(screen.getByLabelText('Time zone')).toHaveValue('Asia/Karachi');
    await fill('Logo URL', 'http://example.com/logo.png');
    await fill('Contact phone', '0300 1234567');
    await fill('Description', 'Too short');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(screen.getByLabelText('Logo URL')).toHaveAccessibleDescription(
      expect.stringContaining('Use an https:// image address'),
    );
    expect(screen.getByLabelText('Contact phone')).toHaveAccessibleDescription(
      expect.stringContaining('Use international format, e.g. +923001234567'),
    );
    expect(screen.getByLabelText('Description')).toHaveAccessibleDescription(
      expect.stringContaining('Write between 10 and 500 characters'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows the error when the server refuses the update', async () => {
    mockApi((call) =>
      call.method === 'PATCH'
        ? errorResponse(403, 'FORBIDDEN', 'Only owners and managers can change restaurant settings')
        : undefined,
    );
    const onSaved = vi.fn();
    renderWithStore(
      <ProfileForm organization={organizationFixture()} mode="settings" onSaved={onSaved} />,
      makeStore(),
    );

    await fill('Contact phone', '+923001234567');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only owners and managers can change restaurant settings',
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('saves the profile with empty optional fields as null', async () => {
    const { calls } = mockApi((call) =>
      call.method === 'PATCH' ? jsonResponse(organizationFixture()) : undefined,
    );
    const onSaved = vi.fn();
    renderWithStore(
      <ProfileForm organization={organizationFixture()} mode="onboarding" onSaved={onSaved} />,
      makeStore(),
    );

    await fill('Logo URL', 'https://cdn.example.pk/logo.png');
    await fill('Contact phone', '+923001234567');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: `/organizations/${ORGANIZATION_ID}`,
      body: {
        name: 'Karachi Grill',
        logoUrl: 'https://cdn.example.pk/logo.png',
        description: null,
        contactPhone: '+923001234567',
        timezone: 'Asia/Karachi',
      },
    });
  });
});

describe('OpeningHoursForm', () => {
  function renderHours(openingHours: Branch['openingHours']) {
    const api = mockApi((call) =>
      call.method === 'PUT' ? jsonResponse(branchFixture({ openingHours })) : undefined,
    );
    const onSaved = vi.fn();
    renderWithStore(
      <OpeningHoursForm
        organizationId={ORGANIZATION_ID}
        branch={branchFixture({ openingHours })}
        mode="onboarding"
        onSaved={onSaved}
      />,
      makeStore(),
    );
    return { ...api, onSaved };
  }

  it('rejects overlapping periods on the same day', async () => {
    const { fetchMock } = renderHours([
      { dayOfWeek: 1, opensAt: '09:00', closesAt: '15:00' },
      { dayOfWeek: 1, opensAt: '14:00', closesAt: '22:00' },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(
      screen.getByText('These hours overlap. Adjust or remove one of the periods.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Monday opens at')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects hours that overlap the previous night', async () => {
    const { fetchMock } = renderHours([
      { dayOfWeek: 1, opensAt: '18:00', closesAt: '02:00' },
      { dayOfWeek: 2, opensAt: '01:00', closesAt: '10:00' },
    ]);

    expect(screen.getByText('Closes next day')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(
      screen.getByText("These hours overlap with Monday's late-night hours."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('copies one day to the whole week and saves', async () => {
    const { calls, onSaved } = renderHours([{ dayOfWeek: 3, opensAt: '12:00', closesAt: '23:30' }]);

    expect(screen.getByRole('switch', { name: 'Open on Monday' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy Wednesday hours to all days' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({ method: 'PUT', path: `${branchPath}/opening-hours` });
    expect(calls[0]?.body).toEqual({
      intervals: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        dayOfWeek,
        opensAt: '12:00',
        closesAt: '23:30',
      })),
    });
  });
});

describe('FulfillmentForm', () => {
  it('requires delivery, pickup or both', async () => {
    const { fetchMock } = mockApi(() => undefined);
    renderWithStore(
      <FulfillmentForm organizationId={ORGANIZATION_ID} branch={branchFixture()} mode="settings" />,
      makeStore(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Offer delivery, pickup or both');
    expect(screen.getByRole('switch', { name: 'Pickup' })).toHaveAccessibleDescription(
      expect.stringContaining('Offer delivery, pickup or both'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends delivery amounts in paisa', async () => {
    const { calls } = mockApi((call) =>
      call.method === 'PUT' ? jsonResponse(branchFixture({ deliveryEnabled: true })) : undefined,
    );
    const onSaved = vi.fn();
    renderWithStore(
      <FulfillmentForm
        organizationId={ORGANIZATION_ID}
        branch={branchFixture()}
        mode="onboarding"
        onSaved={onSaved}
      />,
      makeStore(),
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Delivery' }));
    await userEvent.type(screen.getByLabelText('Delivery fee'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(screen.getByLabelText('Delivery fee')).toHaveAttribute('aria-invalid', 'true');

    await userEvent.clear(screen.getByLabelText('Delivery fee'));
    await userEvent.type(screen.getByLabelText('Delivery fee'), '150');
    await userEvent.type(screen.getByLabelText('Minimum order'), '500.50');
    await userEvent.type(screen.getByLabelText('Delivery time (minutes)'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      path: `${branchPath}/fulfillment`,
      body: {
        deliveryEnabled: true,
        pickupEnabled: false,
        preparationMinutes: 20,
        delivery: { feeMinor: 15000, minimumOrderMinor: 50050, estimatedMinutes: 45 },
      },
    });
  });
});
