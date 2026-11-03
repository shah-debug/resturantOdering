import {
  API_PREFIX,
  type CancelSubscriptionRequest,
  type Paginated,
  type PlatformPayment,
  platformPaymentPageSchema,
  platformPaymentSchema,
  type ReviewPaymentRequest,
  type SubscriptionPaymentStatus,
  type UpdatePlanRequest,
} from '@app/contracts';
import { dashboardApi } from '@/lib/api';

export function platformEvidenceUrl(paymentId: string): string {
  return `/${API_PREFIX}/platform/billing/payments/${encodeURIComponent(paymentId)}/evidence`;
}

export const billingAdminApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    listPlatformPayments: build.query<
      Paginated<PlatformPayment>,
      { status: SubscriptionPaymentStatus; page: number }
    >({
      query: ({ status, page }) => ({
        url: '/platform/billing/payments',
        params: { status, page },
      }),
      transformResponse: (response: unknown) => platformPaymentPageSchema.parse(response),
      providesTags: ['PlatformPayment'],
    }),
    reviewPayment: build.mutation<
      PlatformPayment,
      { paymentId: string; body: ReviewPaymentRequest }
    >({
      query: ({ paymentId, body }) => ({
        url: `/platform/billing/payments/${encodeURIComponent(paymentId)}/review`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: unknown) => platformPaymentSchema.parse(response),
      invalidatesTags: ['PlatformPayment', 'PlatformOrganization', 'PlatformOverview'],
    }),
    cancelSubscription: build.mutation<
      void,
      { organizationId: string; body: CancelSubscriptionRequest }
    >({
      query: ({ organizationId, body }) => ({
        url: `/platform/organizations/${encodeURIComponent(organizationId)}/subscription/cancel`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['PlatformOrganization', 'PlatformOverview'],
    }),
    updatePlan: build.mutation<void, { planId: string; body: UpdatePlanRequest }>({
      query: ({ planId, body }) => ({
        url: `/platform/plans/${encodeURIComponent(planId)}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Plan'],
    }),
  }),
});

export const {
  useListPlatformPaymentsQuery,
  useReviewPaymentMutation,
  useCancelSubscriptionMutation,
  useUpdatePlanMutation,
} = billingAdminApi;
