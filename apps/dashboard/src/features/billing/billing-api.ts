import {
  API_PREFIX,
  type BillingOverview,
  billingOverviewSchema,
  type SubmitPaymentFields,
  type SubscriptionPaymentRecord,
  subscriptionPaymentSchema,
  type SubscriptionState,
  subscriptionStateSchema,
} from '@app/contracts';
import { UPLOAD_TIMEOUT_MS } from '@app/web/api';
import { dashboardApi } from '@/lib/api';

const orgPath = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}`;

export function evidenceUrl(organizationId: string, paymentId: string): string {
  return `/${API_PREFIX}${orgPath(organizationId)}/billing/payments/${encodeURIComponent(paymentId)}/evidence`;
}

export const billingApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    getSubscriptionState: build.query<SubscriptionState, string>({
      query: (organizationId) => `${orgPath(organizationId)}/subscription`,
      transformResponse: (response: unknown) => subscriptionStateSchema.parse(response),
      providesTags: ['SubscriptionState'],
    }),
    getBillingOverview: build.query<BillingOverview, string>({
      query: (organizationId) => `${orgPath(organizationId)}/billing`,
      transformResponse: (response: unknown) => billingOverviewSchema.parse(response),
      providesTags: ['Billing'],
    }),
    submitPayment: build.mutation<
      SubscriptionPaymentRecord,
      { organizationId: string; fields: SubmitPaymentFields; evidence: File | null }
    >({
      query: ({ organizationId, fields, evidence }) => {
        const body = new FormData();
        for (const [key, value] of Object.entries(fields)) {
          if (typeof value === 'string' || typeof value === 'number') {
            body.append(key, String(value));
          }
        }
        if (evidence) {
          body.append('evidence', evidence);
        }
        return {
          url: `${orgPath(organizationId)}/billing/payments`,
          method: 'POST',
          body,
          timeout: UPLOAD_TIMEOUT_MS,
        };
      },
      transformResponse: (response: unknown) => subscriptionPaymentSchema.parse(response),
      invalidatesTags: ['Billing'],
    }),
  }),
});

export const {
  useGetSubscriptionStateQuery,
  useGetBillingOverviewQuery,
  useSubmitPaymentMutation,
} = billingApi;
