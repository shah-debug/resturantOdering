import {
  type AssignRiderRequest,
  type OrderCounts,
  orderCountsSchema,
  type OrderDetail,
  orderDetailSchema,
  type OrderPage,
  orderPageSchema,
  type OrderTransitionRequest,
  type OrderType,
  type OrderView,
} from '@app/contracts';
import { dashboardApi } from '@/lib/api';

export interface OrderListArgs {
  organizationId: string;
  view: OrderView;
  branchId?: string | undefined;
  type?: OrderType | undefined;
  search?: string | undefined;
  page: number;
  pageSize: number;
}

interface OrderTarget {
  organizationId: string;
  orderId: string;
}

const ordersPath = (organizationId: string) =>
  `/organizations/${encodeURIComponent(organizationId)}/orders`;

export const ordersApi = dashboardApi.injectEndpoints({
  endpoints: (build) => ({
    listOrders: build.query<OrderPage, OrderListArgs>({
      query: ({ organizationId, ...params }) => ({
        url: ordersPath(organizationId),
        params: Object.fromEntries(
          Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
        ),
      }),
      transformResponse: (response: unknown) => orderPageSchema.parse(response),
      providesTags: (result) => [
        { type: 'Order', id: 'LIST' },
        ...(result?.items.map((order) => ({ type: 'Order' as const, id: order.id })) ?? []),
      ],
    }),
    getOrderCounts: build.query<
      OrderCounts,
      { organizationId: string; branchId?: string | undefined }
    >({
      query: ({ organizationId, branchId }) => ({
        url: `${ordersPath(organizationId)}/counts`,
        params: branchId ? { branchId } : {},
      }),
      transformResponse: (response: unknown) => orderCountsSchema.parse(response),
      providesTags: ['OrderCounts'],
    }),
    getOrder: build.query<OrderDetail, OrderTarget>({
      query: ({ organizationId, orderId }) =>
        `${ordersPath(organizationId)}/${encodeURIComponent(orderId)}`,
      transformResponse: (response: unknown) => orderDetailSchema.parse(response),
      providesTags: (_result, _error, { orderId }) => [{ type: 'Order', id: orderId }],
    }),
    transitionOrder: build.mutation<OrderDetail, OrderTarget & { body: OrderTransitionRequest }>({
      query: ({ organizationId, orderId, body }) => ({
        url: `${ordersPath(organizationId)}/${encodeURIComponent(orderId)}/transitions`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: unknown) => orderDetailSchema.parse(response),
      invalidatesTags: (_result, _error, { orderId }) => [
        { type: 'Order', id: 'LIST' },
        { type: 'Order', id: orderId },
        'OrderCounts',
        'Rider',
      ],
    }),
    assignRider: build.mutation<OrderDetail, OrderTarget & { body: AssignRiderRequest }>({
      query: ({ organizationId, orderId, body }) => ({
        url: `${ordersPath(organizationId)}/${encodeURIComponent(orderId)}/rider`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: unknown) => orderDetailSchema.parse(response),
      invalidatesTags: (_result, _error, { orderId }) => [
        { type: 'Order', id: 'LIST' },
        { type: 'Order', id: orderId },
        'Rider',
      ],
    }),
  }),
});

export const {
  useListOrdersQuery,
  useGetOrderCountsQuery,
  useGetOrderQuery,
  useTransitionOrderMutation,
  useAssignRiderMutation,
} = ordersApi;
