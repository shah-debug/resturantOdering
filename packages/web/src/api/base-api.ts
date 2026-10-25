import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_PREFIX } from '@app/contracts';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: `/${API_PREFIX}`,
    credentials: 'include',
  }),
  tagTypes: [],
  endpoints: () => ({}),
});
