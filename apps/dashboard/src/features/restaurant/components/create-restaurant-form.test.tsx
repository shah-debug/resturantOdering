import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import {
  type ApiCall,
  errorResponse,
  mockApi,
  ORGANIZATION_ID,
  organizationFixture,
} from '@/testing/api-mock';
import { CreateRestaurantForm } from './create-restaurant-form';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

function setup(handler: (call: ApiCall) => Response | undefined) {
  const api = mockApi(handler);
  renderWithStore(<CreateRestaurantForm />, makeStore());
  return api;
}

function availability(available: boolean, reason: 'taken' | null = null) {
  return (call: ApiCall) => {
    if (call.path === '/organizations/slug-availability') {
      const slug = new URLSearchParams(call.search).get('slug') ?? '';
      return jsonResponse({ slug, available, reason });
    }
    return undefined;
  };
}

describe('CreateRestaurantForm', () => {
  beforeEach(() => {
    navigation.push.mockClear();
  });

  it('suggests a web address from the name and confirms it is available', async () => {
    const { calls } = setup(availability(true));

    await userEvent.type(screen.getByLabelText('Restaurant name'), 'Karachi Grill');

    expect(screen.getByLabelText('Web address')).toHaveValue('karachi-grill');
    expect(
      await screen.findByText('karachi-grill is available', {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/organizations/slug-availability')).toEqual([
      expect.objectContaining({ search: '?slug=karachi-grill' }),
    ]);
  });

  it('validates the web address on the client', async () => {
    const { calls } = setup(availability(true));

    await userEvent.type(screen.getByLabelText('Restaurant name'), 'Karachi Grill');
    const slug = screen.getByLabelText('Web address');
    await userEvent.clear(slug);
    await userEvent.type(slug, '-bad slug');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(slug).toHaveAttribute('aria-invalid', 'true');
    expect(slug).toHaveAccessibleDescription(expect.stringContaining('Use 3–63 lowercase letters'));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('blocks a web address the server reports as taken', async () => {
    const { calls } = setup(availability(false, 'taken'));

    await userEvent.type(screen.getByLabelText('Restaurant name'), 'Karachi Grill');

    expect(
      await screen.findByText(
        'This address is already taken. Try another one.',
        {},
        { timeout: 2000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('shows a 409 conflict from the server on the web address field', async () => {
    setup((call) =>
      call.method === 'POST'
        ? errorResponse(409, 'CONFLICT', 'Organization slug is already in use', [
            { field: 'slug', message: 'That address was just taken' },
          ])
        : availability(true)(call),
    );

    await userEvent.type(screen.getByLabelText('Restaurant name'), 'Karachi Grill');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    const slug = screen.getByLabelText('Web address');
    await vi.waitFor(() => expect(slug).toHaveAttribute('aria-invalid', 'true'));
    expect(slug).toHaveAccessibleDescription(
      expect.stringContaining('That address was just taken'),
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('creates the restaurant and continues to the profile step', async () => {
    const { calls } = setup((call) =>
      call.method === 'POST' && call.path === '/organizations'
        ? jsonResponse(organizationFixture(), 201)
        : availability(true)(call),
    );

    await userEvent.type(screen.getByLabelText('Restaurant name'), 'Karachi Grill');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    await vi.waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        `/organizations/${ORGANIZATION_ID}/onboarding?step=profile`,
      ),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/organizations',
        body: { name: 'Karachi Grill', slug: 'karachi-grill' },
      }),
    );
  });
});
