import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_PREFIX } from '@app/contracts';

export const REQUEST_TIMEOUT_MS = 20_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: `/${API_PREFIX}`,
    credentials: 'include',
    timeout: REQUEST_TIMEOUT_MS,
  }),
  tagTypes: [],
  endpoints: () => ({}),
});
