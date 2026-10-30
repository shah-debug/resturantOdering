import {
  type Rider,
  riderListSchema,
  type RiderPatchRequest,
  riderSchema,
  type RiderUpsertRequest,
} from '@app/contracts';
import { dashboardApi } from '@/lib/api';

const ridersPath = (organizationId: string) =>
  `/organizations/${encodeURIComponent(organizationId)}/riders`;

export const ridersApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    listRiders: build.query<
      Rider[],
      { organizationId: string; branchId?: string | undefined; status?: 'ACTIVE' | undefined }
    >({
      query: ({ organizationId, branchId, status }) => ({
        url: ridersPath(organizationId),
        params: { ...(branchId ? { branchId } : {}), ...(status ? { status } : {}) },
      }),
      transformResponse: (response: unknown) => riderListSchema.parse(response),
      providesTags: ['Rider'],
    }),
    createRider: build.mutation<Rider, { organizationId: string; body: RiderUpsertRequest }>({
      query: ({ organizationId, body }) => ({
        url: ridersPath(organizationId),
        method: 'POST',
        body,
      }),
      transformResponse: (response: unknown) => riderSchema.parse(response),
      invalidatesTags: ['Rider'],
    }),
    updateRider: build.mutation<
      Rider,
      { organizationId: string; riderId: string; body: RiderUpsertRequest }
    >({
      query: ({ organizationId, riderId, body }) => ({
        url: `${ridersPath(organizationId)}/${encodeURIComponent(riderId)}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: unknown) => riderSchema.parse(response),
      invalidatesTags: ['Rider'],
    }),
    patchRider: build.mutation<
      Rider,
      { organizationId: string; riderId: string; body: RiderPatchRequest }
    >({
      query: ({ organizationId, riderId, body }) => ({
        url: `${ridersPath(organizationId)}/${encodeURIComponent(riderId)}`,
        method: 'PATCH',
        body,
      }),
      transformResponse: (response: unknown) => riderSchema.parse(response),
      invalidatesTags: ['Rider'],
    }),
  }),
});

export const {
  useListRidersQuery,
  useCreateRiderMutation,
  useUpdateRiderMutation,
  usePatchRiderMutation,
} = ridersApi;
