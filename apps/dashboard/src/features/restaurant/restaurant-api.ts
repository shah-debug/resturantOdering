import { z } from 'zod';
import {
  type Branch,
  branchSchema,
  type CreateBranchRequest,
  type FulfillmentRequest,
  type OnboardingStatus,
  onboardingStatusSchema,
  type OpeningHoursRequest,
  type SlugAvailability,
  slugAvailabilitySchema,
  type UpdateBranchRequest,
} from '@app/contracts';
import { dashboardApi } from '@/lib/api';

const branchListSchema = z.array(branchSchema);
const parseBranch = (response: unknown): Branch => branchSchema.parse(response);
const parseOnboarding = (response: unknown): OnboardingStatus =>
  onboardingStatusSchema.parse(response);

interface BranchTarget {
  organizationId: string;
  branchId: string;
}

function organizationPath(organizationId: string): string {
  return `/organizations/${encodeURIComponent(organizationId)}`;
}

function branchPath({ organizationId, branchId }: BranchTarget): string {
  return `${organizationPath(organizationId)}/branches/${encodeURIComponent(branchId)}`;
}

function branchTags(organizationId: string, branchId: string) {
  return [
    { type: 'Branch' as const, id: branchId },
    { type: 'Branch' as const, id: `LIST-${organizationId}` },
    { type: 'Onboarding' as const, id: organizationId },
  ];
}

export const restaurantApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    checkSlugAvailability: build.query<SlugAvailability, string>({
      query: (slug) => ({ url: '/organizations/slug-availability', params: { slug } }),
      transformResponse: (response: unknown) => slugAvailabilitySchema.parse(response),
      providesTags: ['SlugAvailability'],
      keepUnusedDataFor: 30,
    }),
    getOnboardingStatus: build.query<OnboardingStatus, string>({
      query: (organizationId) => `${organizationPath(organizationId)}/onboarding`,
      transformResponse: parseOnboarding,
      providesTags: (_result, _error, organizationId) => [
        { type: 'Onboarding', id: organizationId },
      ],
    }),
    completeOnboarding: build.mutation<OnboardingStatus, string>({
      query: (organizationId) => ({
        url: `${organizationPath(organizationId)}/onboarding/complete`,
        method: 'POST',
      }),
      transformResponse: parseOnboarding,
      invalidatesTags: (result, _error, organizationId) =>
        result
          ? [
              { type: 'Onboarding', id: organizationId },
              { type: 'Organization', id: organizationId },
            ]
          : [],
    }),
    listBranches: build.query<Branch[], string>({
      query: (organizationId) => `${organizationPath(organizationId)}/branches`,
      transformResponse: (response: unknown) => branchListSchema.parse(response),
      providesTags: (result, _error, organizationId) => [
        { type: 'Branch', id: `LIST-${organizationId}` },
        ...(result ?? []).map(({ id }) => ({ type: 'Branch' as const, id })),
      ],
    }),
    getBranch: build.query<Branch, BranchTarget>({
      query: (target) => branchPath(target),
      transformResponse: parseBranch,
      providesTags: (_result, _error, { branchId }) => [{ type: 'Branch', id: branchId }],
    }),
    createBranch: build.mutation<Branch, { organizationId: string; body: CreateBranchRequest }>({
      query: ({ organizationId, body }) => ({
        url: `${organizationPath(organizationId)}/branches`,
        method: 'POST',
        body,
      }),
      transformResponse: parseBranch,
      invalidatesTags: (result, _error, { organizationId }) =>
        result ? branchTags(organizationId, result.id) : [],
    }),
    updateBranch: build.mutation<Branch, BranchTarget & { body: UpdateBranchRequest }>({
      query: ({ body, ...target }) => ({ url: branchPath(target), method: 'PATCH', body }),
      transformResponse: parseBranch,
      invalidatesTags: (result, _error, { organizationId, branchId }) =>
        result ? branchTags(organizationId, branchId) : [],
    }),
    updateOpeningHours: build.mutation<Branch, BranchTarget & { body: OpeningHoursRequest }>({
      query: ({ body, ...target }) => ({
        url: `${branchPath(target)}/opening-hours`,
        method: 'PUT',
        body,
      }),
      transformResponse: parseBranch,
      invalidatesTags: (result, _error, { organizationId, branchId }) =>
        result ? branchTags(organizationId, branchId) : [],
    }),
    updateFulfillment: build.mutation<Branch, BranchTarget & { body: FulfillmentRequest }>({
      query: ({ body, ...target }) => ({
        url: `${branchPath(target)}/fulfillment`,
        method: 'PUT',
        body,
      }),
      transformResponse: parseBranch,
      invalidatesTags: (result, _error, { organizationId, branchId }) =>
        result ? branchTags(organizationId, branchId) : [],
    }),
  }),
});

export const {
  useCheckSlugAvailabilityQuery,
  useGetOnboardingStatusQuery,
  useCompleteOnboardingMutation,
  useListBranchesQuery,
  useGetBranchQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useUpdateOpeningHoursMutation,
  useUpdateFulfillmentMutation,
} = restaurantApi;
