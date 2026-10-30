import { API_PREFIX, type SalesReport, salesReportSchema } from '@app/contracts';
import { dashboardApi } from '@/lib/api';

export interface ReportArgs {
  organizationId: string;
  from: string;
  to: string;
  branchId?: string | undefined;
}

const reportsPath = (organizationId: string) =>
  `/organizations/${encodeURIComponent(organizationId)}/reports`;

function params({ from, to, branchId }: ReportArgs): Record<string, string> {
  return { from, to, ...(branchId ? { branchId } : {}) };
}

export function ordersExportUrl(args: ReportArgs): string {
  return `/${API_PREFIX}${reportsPath(args.organizationId)}/orders.csv?${new URLSearchParams(params(args)).toString()}`;
}

export const reportsApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    getSalesReport: build.query<SalesReport, ReportArgs>({
      query: (args) => ({ url: `${reportsPath(args.organizationId)}/sales`, params: params(args) }),
      transformResponse: (response: unknown) => salesReportSchema.parse(response),
      providesTags: ['Report'],
    }),
  }),
});

export const { useGetSalesReportQuery } = reportsApi;
