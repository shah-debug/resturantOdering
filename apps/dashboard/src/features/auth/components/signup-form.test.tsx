import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import { errorResponse, mockApi } from '@/testing/api-mock';
import { SignupForm } from './signup-form';

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText('Full name'), 'Ayesha Khan');
  await userEvent.type(screen.getByLabelText('Email'), 'ayesha@example.pk');
  await userEvent.type(screen.getByLabelText('Password'), 'a-very-long-password');
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('SignupForm', () => {
  it('shows the check-your-email state after the API accepts the signup', async () => {
    const { calls } = mockApi(() =>
      jsonResponse({ message: 'If the address can be used, we sent a verification link.' }, 202),
    );
    renderWithStore(<SignupForm />, makeStore());

    await fillAndSubmit();

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('ayesha@example.pk')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('we sent a verification link');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/auth/signup',
      body: {
        email: 'ayesha@example.pk',
        fullName: 'Ayesha Khan',
        password: 'a-very-long-password',
      },
    });
  });

  it('rejects a short password without calling the API', async () => {
    const { fetchMock } = mockApi(() => undefined);
    renderWithStore(<SignupForm />, makeStore());

    await userEvent.type(screen.getByLabelText('Full name'), 'Ayesha Khan');
    await userEvent.type(screen.getByLabelText('Email'), 'ayesha@example.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use at least 12 characters')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps server validation details onto the matching fields', async () => {
    mockApi(() =>
      errorResponse(400, 'VALIDATION_FAILED', 'Validation failed', [
        { field: 'email', message: 'This email cannot be used' },
      ]),
    );
    renderWithStore(<SignupForm />, makeStore());

    await fillAndSubmit();

    expect(await screen.findByText('This email cannot be used')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});
