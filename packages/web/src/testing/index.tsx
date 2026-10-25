import { configureStore, type EnhancedStore } from '@reduxjs/toolkit';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { baseApi } from '../api/base-api';

export function createTestStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

export function renderWithStore<TStore extends EnhancedStore>(
  ui: ReactElement,
  store: TStore,
): RenderResult & { store: TStore } {
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
