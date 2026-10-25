import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { NETWORK_ERROR_MESSAGE } from '../../../api/api-error';
import { createTestStore, jsonResponse, renderWithStore } from '../../../testing';
import { ApiStatus } from './api-status';

const healthy = { status: 'ok', uptimeSeconds: 12, timestamp: '2026-01-01T00:00:00.000Z' };

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe('ApiStatus', () => {
  it('shows a loading state, then reports the API as online', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(healthy)));
    vi.stubGlobal('fetch', fetchMock);

    renderWithStore(<ApiStatus />, createTestStore());

    expect(screen.getByRole('status')).toHaveTextContent('Checking API status');
    expect(await screen.findByText('API is online')).toBeInTheDocument();

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input && requestUrl(input)).toBe('http://localhost:3000/api/v1/health');
    const sentRequest = input instanceof Request ? input : null;
    expect(sentRequest?.credentials ?? init?.credentials).toBe('include');
  });

  it('shows the server error message from the standard envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          jsonResponse(
            {
              statusCode: 503,
              code: 'INTERNAL_ERROR',
              message: 'An unexpected error occurred',
              path: '/api/v1/health',
              timestamp: '2026-01-01T00:00:00.000Z',
            },
            503,
          ),
        ),
      ),
    );

    renderWithStore(<ApiStatus />, createTestStore());

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred');
  });

  it('treats a response that breaks the contract as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({ status: 'degraded' }))),
    );

    renderWithStore(<ApiStatus />, createTestStore());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('recovers after a network failure when the user retries', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(jsonResponse(healthy));
    vi.stubGlobal('fetch', fetchMock);

    renderWithStore(<ApiStatus />, createTestStore());

    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('API is online')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
