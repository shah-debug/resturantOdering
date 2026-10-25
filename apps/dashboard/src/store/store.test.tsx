import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ApiStatus } from '@app/web/system';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from './store';

describe('makeStore', () => {
  it('registers the shared API slice and middleware', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          jsonResponse({ status: 'ok', uptimeSeconds: 1, timestamp: '2026-01-01T00:00:00.000Z' }),
        ),
      ),
    );

    const { store } = renderWithStore(<ApiStatus />, makeStore());

    expect(await screen.findByText('API is online')).toBeInTheDocument();
    expect(Object.keys(store.getState().api.queries)).toContain('getHealth(undefined)');
  });
});
