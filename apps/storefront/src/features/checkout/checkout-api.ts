import {
  type CheckoutQuote,
  type CheckoutQuoteRequest,
  checkoutQuoteSchema,
  IDEMPOTENCY_KEY_HEADER,
  ORDER_TOKEN_HEADER,
  type OrderTracking,
  orderTrackingSchema,
  type PlacedOrder,
  placedOrderSchema,
  type PlaceOrderRequest,
} from '@app/contracts';
import { baseApi } from '@app/web/api';

const restaurantPath = (slug: string) => `storefront/restaurants/${encodeURIComponent(slug)}`;

export const checkoutApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    quoteCheckout: build.mutation<CheckoutQuote, { slug: string; body: CheckoutQuoteRequest }>({
      query: ({ slug, body }) => ({
        url: `${restaurantPath(slug)}/checkout/quote`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: unknown) => checkoutQuoteSchema.parse(response),
    }),
    placeOrder: build.mutation<
      PlacedOrder,
      { slug: string; idempotencyKey: string; body: PlaceOrderRequest }
    >({
      query: ({ slug, idempotencyKey, body }) => ({
        url: `${restaurantPath(slug)}/orders`,
        method: 'POST',
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body,
      }),
      transformResponse: (response: unknown) => placedOrderSchema.parse(response),
    }),
    cancelOrder: build.mutation<OrderTracking, { slug: string; orderId: string; token: string }>({
      query: ({ slug, orderId, token }) => ({
        url: `${restaurantPath(slug)}/orders/${encodeURIComponent(orderId)}/cancel`,
        method: 'POST',
        headers: { [ORDER_TOKEN_HEADER]: token },
        body: {},
      }),
      transformResponse: (response: unknown) => orderTrackingSchema.parse(response),
    }),
  }),
});

export const { useQuoteCheckoutMutation, usePlaceOrderMutation, useCancelOrderMutation } =
  checkoutApi;
