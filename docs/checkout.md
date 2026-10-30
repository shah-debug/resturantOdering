# Guest checkout and orders

Customers order from `/r/<slug>/checkout` without an account. They choose delivery or pickup, enter their name and mobile number (and an address for delivery), add an optional note or promo code, and pay **cash** when the order arrives or at pickup. After ordering they land on a private tracking page.

## Flow

1. **Quote** — `POST /api/v1/storefront/restaurants/:slug/checkout/quote` with the branch, fulfillment, payment method, optional promo code and cart items (ids and quantities only). The server re-reads the menu and returns priced lines, the full price breakdown, the estimated time and any **issues** that block ordering. The checkout page re-quotes whenever the cart, order type, branch, area/city or promo code changes.
2. **Place order** — `POST /api/v1/storefront/restaurants/:slug/orders` with an `Idempotency-Key` header, the same fields plus `customer`, `note` and `expectedTotalMinor` (the total the customer saw). Returns `201 { orderId, orderNumber, trackingToken, totalMinor }`.
3. **Track** — `/r/<slug>/orders/<orderId>?token=<trackingToken>` (server-rendered; the storefront server calls `GET …/orders/:orderId` with an `X-Order-Token` header). Refreshes every 30 seconds until the order finishes.
4. **Cancel** — while the order is `PENDING`, the customer can cancel from the tracking page (`POST …/orders/:orderId/cancel` with `X-Order-Token`).

## What the server checks (every quote, and again inside the order transaction)

| Rule           | Behaviour                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restaurant     | Must be published (`ACTIVE`, onboarding complete); otherwise `404`.                                                                                                    |
| Branch         | Must belong to the restaurant and be `ACTIVE`; ids from other restaurants are treated as unknown.                                                                      |
| Open           | The branch must be accepting orders and open now in the restaurant's time zone. Scheduled orders are not supported yet.                                                |
| Fulfillment    | Pickup/delivery must be enabled on the branch.                                                                                                                         |
| Items          | Each product, option and extra must belong to this restaurant, be published/available/not archived, in an active category, with required groups and min/max respected. |
| Prices         | Always the current database prices; the request cannot carry prices (unknown fields are rejected with `400`).                                                          |
| Delivery area  | See _Delivery zones_ below.                                                                                                                                            |
| Minimum order  | The matched zone's minimum, compared with the item subtotal (delivery only).                                                                                           |
| Payment        | Only **cash** is enabled (`ENABLED_PAYMENT_METHODS`). Other methods exist in the schema but are rejected until a provider is configured.                               |
| Promo code     | Active, within its dates, under its usage limit and per-customer limit, minimum spend met; `FREE_DELIVERY` codes need a delivery order.                                |
| Expected total | If the server total differs from `expectedTotalMinor`, the order is refused with `409 PRICE_CHANGED` so the customer can review the new total.                         |

Blocking problems come back from the quote as `issues` (`STORE_CLOSED`, `BRANCH_UNAVAILABLE`, `FULFILLMENT_UNAVAILABLE`, `ITEM_UNAVAILABLE`, `DELIVERY_UNAVAILABLE`, `MINIMUM_ORDER_NOT_MET`, `PROMOTION_INVALID`, `PAYMENT_METHOD_UNAVAILABLE`) and from order placement as `422 CHECKOUT_REJECTED` with one `details` entry per issue (`field` points at the offending input, e.g. `items.1`).

## Totals

Computed by `priceOrder` (`apps/api/src/modules/orders/domain/order-pricing.ts`), all in integer paisa:

- line subtotal = (option price + extras) × quantity; subtotal = sum of lines
- order discounts are spread across lines by largest remainder; tax uses the branch's `tax_rate_bps` and `prices_include_tax`, rounded half-up per line
- total = subtotal − discount + tax (unless included) + delivery fee − delivery discount + rounding
- cash orders are rounded to the nearest rupee (`rounding_adjustment_minor`, at most ±99 paisa)

The database independently checks the total formula and that order totals equal the sum of their items.

## Creating the order

Inside one database transaction:

1. Lock the branch, products, categories, options, extras and group links (`FOR SHARE`) so availability and prices cannot change mid-order; re-run every check.
2. Redeem the promotion with a conditional update (`times_redeemed < usage_limit`).
3. Upsert the customer by `(restaurant, phone)`; blocked customers are refused.
4. Take the next per-restaurant order number (`organizations.last_order_number`).
5. Insert the order (`PENDING`, payment status `UNPAID`), item snapshots (product, option and extra names and prices at the time of ordering), one status-history entry (`→ PENDING`, actor `CUSTOMER`) and a `PENDING` cash payment for the total.

**Cash orders are never marked paid at creation**; `paid_at` stays empty until cash is collected (a later phase). Database triggers still reject unorderable items as a last line of defence; that case is reported to the customer as `422 CHECKOUT_REJECTED`.

## Idempotency

- `Idempotency-Key` (16–64 characters `[A-Za-z0-9_-]`) is required. Keys are scoped per restaurant (`orders (organization_id, idempotency_key)` is unique).
- The order stores a SHA-256 fingerprint of the validated request. Repeating the same request returns the original order with `200` and `Idempotent-Replayed: true`; reusing a key with a different body returns `409 IDEMPOTENCY_CONFLICT`.
- Concurrent duplicates race on the unique key; the loser returns the winner's order.
- The checkout page keeps one key per distinct order body, so retrying after a network error cannot create a second order.

## Tracking links

- The tracking token is an HMAC-SHA256 of the restaurant and order ids with `ORDER_TRACKING_SECRET` (base64url, 43 characters). Nothing secret is stored in the database, and replays return the same link.
- Wrong or missing tokens, other restaurants' slugs and unknown ids all return the same `404`.
- The tracking response masks the phone number and contains only this order's details. Tracking pages are `noindex`, `no-store` and use `Referrer-Policy: no-referrer`; anyone with the link can view the order, which the confirmation message tells the customer.
- Rotating `ORDER_TRACKING_SECRET` invalidates all existing links. It is required in production; in development a random per-process secret is used if it is not set.

## Status changes

Order statuses follow the explicit state machine in `order-status.ts`, mirrored by a database trigger that rejects any other transition (see [database-design.md](database-design.md)). In this phase the only customer transition is `PENDING → CANCELLED`, applied with a conditional update (`WHERE status = 'PENDING'`), a status-history entry and the cash payment set to `CANCELLED`. Once the restaurant confirms, the customer can no longer cancel (`409`).

## Delivery zones

Each active zone of the branch is checked against the address:

- the address city must match the branch city (case and spacing ignored);
- if the zone lists **areas**, the address area must be one of them;
- if the zone has a **radius**, both the branch and the address need coordinates and the distance must be within the radius (boundary included).

The cheapest matching zone wins (then lowest minimum, then name). The default "Standard delivery" zone created in onboarding has no areas or radius, so it covers the branch's city. Area lists and radii can currently be set only in the database; a dashboard editor comes with order operations.

## Rate limits and CSRF

- Placing and cancelling orders use the strict per-IP limit (`AUTH_RATE_LIMIT_MAX_REQUESTS` per `AUTH_RATE_LIMIT_WINDOW_SECONDS`); quotes use the default limit; server-rendered tracking uses the storefront budget.
- All `POST`s require a trusted `Origin` (the storefront is in `APP_ORIGINS`).

## Configuration

| Variable                | Notes                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `ORDER_TRACKING_SECRET` | API. At least 32 characters; required in production. Keep it stable. |

## Not in this phase

Online payment gateways, scheduled orders, saved addresses and customer accounts, and customer notifications (SMS/WhatsApp) are later phases. Staff order handling is described in [orders.md](orders.md).

## Tests

- API integration (`test/integration/checkout.int-spec.ts`, 35 tests): quotes and totals with tax and cash rounding, order/snapshot/history/payment creation, per-restaurant numbering, tampered prices and fields, invalid and cross-tenant items, branches and add-ons, sold-out items and price changes between quote and order, closed stores, idempotent replays including simultaneous duplicates and key reuse, delivery areas/radius boundaries/minimums, promotions, tracking authorization and customer cancellation.
- API unit: delivery zone matching and distance, tracking tokens, production secret requirement, rate-limit metadata.
- Storefront unit: phone normalisation, request building and validation, checkout UI (quotes, validation, idempotency-key reuse on retry, price changes, blocking issues, pickup) and the tracking page (progress, cancel).
- Browser (Playwright, mobile and desktop): delivery order with tracking and cancellation, pickup order, out-of-area delivery, items selling out during checkout, empty checkout, tampered tracking links.
