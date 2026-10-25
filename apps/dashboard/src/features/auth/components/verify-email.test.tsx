import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import { errorResponse, mockApi } from '@/testing/api-mock';
import { VerifyEmail } from './verify-email';

const TOKEN = 'a'.repeat(43);

describe('VerifyEmail', () => {
  it('posts the token once and shows success with a link to sign in', async () => {
    const { calls } = mockApi(() => jsonResponse({ message: 'Your email address is verified.' }));
    renderWithStore(
      <StrictMode>
        <VerifyEmail token={TOKEN} />
      </StrictMode>,
      makeStore(),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Verifying your email');
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(calls).toEqual([
      { method: 'POST', path: '/auth/email/verify', search: '', body: { token: TOKEN } },
    ]);
  });

  it('shows the invalid state and lets the user request a new link', async () => {
    const { calls } = mockApi((call) =>
      call.path === '/auth/email/verify'
        ? errorResponse(400, 'INVALID_TOKEN', 'This link is invalid or has expired')
        : jsonResponse({ message: 'If an account exists, we sent a new link.' }, 202),
    );
    renderWithStore(<VerifyEmail token={TOKEN} />, makeStore());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This link is invalid or has expired',
    );
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');

    await userEvent.type(screen.getByLabelText('Email'), 'ayesha@example.pk');
    await userEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect(
      await screen.findByText('If an account exists, we sent a new link.'),
    ).toBeInTheDocument();
    expect(calls[1]).toMatchObject({
      path: '/auth/email/resend',
      body: { email: 'ayesha@example.pk' },
    });
  });

  it('does not call the API for a malformed token', () => {
    const { fetchMock } = mockApi(() => undefined);
    renderWithStore(<VerifyEmail token="short" />, makeStore());

    expect(
      screen.getByRole('heading', { name: 'Verification link not valid' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
