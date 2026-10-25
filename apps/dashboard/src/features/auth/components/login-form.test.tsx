import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import { errorResponse, meFixture, mockApi } from '@/testing/api-mock';
import { LoginForm } from './login-form';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

describe('LoginForm', () => {
  beforeEach(() => {
    navigation.replace.mockClear();
  });

  it('validates the form on the client before calling the API', async () => {
    const { fetchMock } = mockApi(() => undefined);
    renderWithStore(<LoginForm />, makeStore());

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address',
    );
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the invalid-credentials message from the API', async () => {
    mockApi(() => errorResponse(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect'));
    renderWithStore(<LoginForm />, makeStore());

    await userEvent.type(screen.getByLabelText('Email'), 'owner@example.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('signs in and returns to the requested page', async () => {
    const { calls } = mockApi((call) =>
      call.path === '/auth/login' ? jsonResponse(meFixture()) : undefined,
    );
    renderWithStore(<LoginForm next="/organizations/abc/members" />, makeStore());

    await userEvent.type(screen.getByLabelText('Email'), ' Owner@Example.pk ');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await vi.waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/organizations/abc/members'),
    );
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/auth/login',
      body: { email: 'owner@example.pk', password: 'correct horse battery' },
    });
  });

  it('ignores an unsafe return path', async () => {
    mockApi(() => jsonResponse(meFixture()));
    renderWithStore(<LoginForm next="//evil.example.com" />, makeStore());

    await userEvent.type(screen.getByLabelText('Email'), 'owner@example.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await vi.waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/'));
  });
});
