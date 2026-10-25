import { healthResponseSchema, type HealthResponse } from '@app/contracts';
import { baseApi } from '../../api/base-api';

export const systemApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getHealth: build.query<HealthResponse, void>({
      query: () => '/health',
      transformResponse: (response: unknown) => healthResponseSchema.parse(response),
    }),
  }),
});

export const { useGetHealthQuery } = systemApi;
