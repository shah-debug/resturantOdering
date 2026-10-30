import {
  API_PREFIX,
  type AuditEntry,
  auditPageSchema,
  type CreatePlanRequest,
  type OrganizationStatusChange,
  type Paginated,
  type Plan,
  planListSchema,
  planSchema,
  type PlatformHealth,
  platformHealthSchema,
  type PlatformOrganization,
  type PlatformOrganizationDetail,
  platformOrganizationDetailSchema,
  platformOrganizationPageSchema,
  type SubscriptionAssignment,
  type SubscriptionOverview,
  subscriptionOverviewSchema,
} from '@app/contracts';
import { dashboardApi } from '@/lib/api';

export interface RestaurantListArgs {
  search?: string | undefined;
  status?: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | undefined;
  page: number;
  pageSize: number;
}

function clean(
  params: Record<string, string | number | undefined>,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '',
    ),
  );
}

export function restaurantsExportUrl(args: Omit<RestaurantListArgs, 'page' | 'pageSize'>): string {
  const query = new URLSearchParams(
    Object.entries(clean(args)).map(([key, value]) => [key, String(value)]),
  ).toString();
  return `/${API_PREFIX}/platform/organizations/export.csv${query ? `?${query}` : ''}`;
}

export const platformApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    listPlatformRestaurants: build.query<Paginated<PlatformOrganization>, RestaurantListArgs>({
      query: (args) => ({ url: '/platform/organizations', params: clean({ ...args }) }),
      transformResponse: (response: unknown) => platformOrganizationPageSchema.parse(response),
      providesTags: [{ type: 'PlatformOrganization', id: 'LIST' }],
    }),
    getPlatformRestaurant: build.query<PlatformOrganizationDetail, string>({
      query: (organizationId) => `/platform/organizations/${encodeURIComponent(organizationId)}`,
      transformResponse: (response: unknown) => platformOrganizationDetailSchema.parse(response),
      providesTags: (_result, _error, organizationId) => [
        { type: 'PlatformOrganization', id: organizationId },
      ],
    }),
    changeRestaurantStatus: build.mutation<
      PlatformOrganizationDetail,
      { organizationId: string; body: OrganizationStatusChange }
    >({
      query: ({ organizationId, body }) => ({
        url: `/platform/organizations/${encodeURIComponent(organizationId)}/status`,
        method: 'PATCH',
        body,
      }),
      transformResponse: (response: unknown) => platformOrganizationDetailSchema.parse(response),
      invalidatesTags: (_result, _error, { organizationId }) => [
        { type: 'PlatformOrganization', id: 'LIST' },
        { type: 'PlatformOrganization', id: organizationId },
        'PlatformOverview',
      ],
    }),
    assignSubscription: build.mutation<
      PlatformOrganizationDetail,
      { organizationId: string; body: SubscriptionAssignment }
    >({
      query: ({ organizationId, body }) => ({
        url: `/platform/organizations/${encodeURIComponent(organizationId)}/subscription`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: unknown) => platformOrganizationDetailSchema.parse(response),
      invalidatesTags: (_result, _error, { organizationId }) => [
        { type: 'PlatformOrganization', id: 'LIST' },
        { type: 'PlatformOrganization', id: organizationId },
        'Plan',
        'PlatformOverview',
      ],
    }),
    listPlans: build.query<Plan[], void>({
      query: () => '/platform/plans',
      transformResponse: (response: unknown) => planListSchema.parse(response),
      providesTags: ['Plan'],
    }),
    createPlan: build.mutation<Plan, CreatePlanRequest>({
      query: (body) => ({ url: '/platform/plans', method: 'POST', body }),
      transformResponse: (response: unknown) => planSchema.parse(response),
      invalidatesTags: ['Plan'],
    }),
    getSubscriptionOverview: build.query<SubscriptionOverview, void>({
      query: () => '/platform/subscriptions/overview',
      transformResponse: (response: unknown) => subscriptionOverviewSchema.parse(response),
      providesTags: ['PlatformOverview'],
    }),
    getPlatformHealth: build.query<PlatformHealth, void>({
      query: () => '/platform/health',
      transformResponse: (response: unknown) => platformHealthSchema.parse(response),
    }),
    listAuditLogs: build.query<
      Paginated<AuditEntry>,
      { organizationId?: string | undefined; action?: string | undefined; page: number }
    >({
      query: (args) => ({ url: '/platform/audit-logs', params: clean({ ...args }) }),
      transformResponse: (response: unknown) => auditPageSchema.parse(response),
    }),
  }),
});

export const {
  useListPlatformRestaurantsQuery,
  useGetPlatformRestaurantQuery,
  useChangeRestaurantStatusMutation,
  useAssignSubscriptionMutation,
  useListPlansQuery,
  useCreatePlanMutation,
  useGetSubscriptionOverviewQuery,
  useGetPlatformHealthQuery,
  useListAuditLogsQuery,
} = platformApi;
