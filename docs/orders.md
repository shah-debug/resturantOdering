# Order operations, kitchen and riders

Restaurant staff run orders from the dashboard: **Orders** (board and order detail), **Kitchen** (cooking tickets) and **Riders** (the restaurant's own delivery riders). There is no rider app or GPS; staff update delivery status by hand.

## Views

| View             | Statuses                              |
| ---------------- | ------------------------------------- |
| New              | `PENDING`                             |
| Accepted         | `CONFIRMED`                           |
| Preparing        | `PREPARING`                           |
| Ready            | `READY`                               |
| Out for delivery | `OUT_FOR_DELIVERY`, `DELIVERY_FAILED` |
| Delivered        | `DELIVERED`, `COMPLETED`              |
| Cancelled        | `CANCELLED`, `REJECTED`               |

Active views are sorted oldest first; finished views newest first. Filters: order type, branch, and search by order number (`42` or `#42`), customer name or phone. Pages of up to 100 orders.

## API

All under `/api/v1/organizations/:organizationId`, behind the usual session, CSRF and organization checks. Staff whose membership has a branch only ever see and change orders and riders of that branch (other branches return `404`).

| Method | Path                           | Permission      | Notes                                                                    |
| ------ | ------------------------------ | --------------- | ------------------------------------------------------------------------ |
| GET    | `/orders`                      | `orders:read`   | `view`, `type`, `branchId`, `search`, `from`, `to`, `page`, `pageSize`   |
| GET    | `/orders/counts`               | `orders:read`   | Count per view                                                           |
| GET    | `/orders/events`               | `orders:read`   | Server-sent events (see _Live updates_)                                  |
| GET    | `/orders/:orderId`             | `orders:read`   | Items with customizations, customer and delivery details, history        |
| POST   | `/orders/:orderId/transitions` | per transition  | `{ to, expectedStatus, reason? }`                                        |
| PUT    | `/orders/:orderId/rider`       | `orders:manage` | `{ riderId \| null, expectedRiderId \| null }`                           |
| GET    | `/riders`                      | `riders:read`   | `branchId`, `status`                                                     |
| POST   | `/riders`                      | `riders:manage` | Name, phone (unique per restaurant), branch, vehicle                     |
| PUT    | `/riders/:riderId`             | `riders:manage` | Full update                                                              |
| PATCH  | `/riders/:riderId`             | `riders:manage` | `status` (`ACTIVE`/`INACTIVE`) or `availability` (`AVAILABLE`/`OFFLINE`) |

List and detail responses include `availableTransitions` (what _this_ user may do next) and `canAssignRider`, so the dashboard never offers an action the server would refuse.

## Status changes

The state machine (`order-status.ts`, mirrored by a database trigger) is:

```
PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED     (delivery)
                                       ↘ COMPLETED                         (pickup)
OUT_FOR_DELIVERY ⇄ DELIVERY_FAILED
PENDING → REJECTED
PENDING / CONFIRMED / PREPARING / READY / DELIVERY_FAILED → CANCELLED
```

| Target                                                                  | Who                                           |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| Accept, reject, send out, delivered, delivery failed, picked up, cancel | Owner, manager, order staff (`orders:manage`) |
| Start preparing, mark ready                                             | Also kitchen staff (`kitchen:update`)         |

- **Reasons** are required to reject, cancel or mark a delivery as failed. Reject/cancel reasons are stored on the order; all reasons are kept in the status history. They are never shown to customers.
- **Concurrency:** every change sends the status the user was looking at (`expectedStatus`). The update is conditional (`WHERE status = expectedStatus`), so of two simultaneous clicks exactly one wins and the other gets `409` with the current status. Invalid transitions are `409`, missing permission `403`.
- Each change writes a status-history entry (actor, time, reason) and an audit log entry in the same transaction.
- **Payments:** cash is marked collected (`SUCCEEDED`, `paid_at`, collecting rider) only when the order is delivered or picked up; rejecting or cancelling cancels the pending payment. Orders are never marked paid when placed.

## Riders

- Riders belong to one branch of the restaurant. The composite foreign key keeps them inside the restaurant; the API also refuses riders from another branch, inactive riders and riders of other restaurants (`422`).
- A rider can be assigned or changed while the order is accepted, preparing, ready, or after a failed delivery — never while it is out. Assignment is conditional on the rider the user saw (`expectedRiderId`), so concurrent reassignments cannot overwrite each other.
- Sending an order out needs a rider and marks them **on delivery**; when their last delivery is delivered, failed or cancelled they become **available** again.
- Riders out on a delivery cannot be deactivated, moved to another branch or marked off duty.

## Live updates

- `GET …/orders/events` is a server-sent events stream. It sends `ready` on connect (with `retry: 5000`), `order` events (`order.created` / `order.updated` with id, number, branch and status — no customer data), and a `ping` every 25 seconds. Connections are closed after 15 minutes so the session is re-checked on reconnect. Staff limited to one branch only receive that branch's events.
- Events are published **after** the database transaction commits, from an in-process event bus. Publishing can never roll back or corrupt an order.
- The dashboard keeps one connection per open restaurant. On every `ready` (first connect and each reconnect) it re-fetches orders, so nothing is missed while disconnected. Reconnects back off 5 s → 15 s → 30 s → 60 s (never a tight loop) and retry immediately when the tab becomes visible again.
- If a reconnect fails, a red banner says live updates are offline, and order lists fall back to refreshing once a minute until the stream is back.
- New orders show a banner on every dashboard page and play a short chime (staff can switch the sound off).
- **Scaling note:** the event bus is in memory, so with more than one API instance each dashboard only hears events from the instance it is connected to. Re-fetch on reconnect and the one-minute fallback still keep lists correct; for multiple instances, replace `OrderEventsService` with Postgres `LISTEN/NOTIFY` or Redis pub/sub.

## Notifications (outbox)

- When an order is placed, a `notifications` row (`EMAIL`, template `order.placed.staff`, to the restaurant's contact email) is inserted **inside the order transaction**, with a unique `dedupe_key` per order and recipient. Repeated or replayed submissions cannot create a second notification.
- `NotificationDispatcher` runs every `NOTIFICATION_DISPATCH_INTERVAL_SECONDS` (default 15; `0` disables it; never runs in tests). It claims due rows with `FOR UPDATE SKIP LOCKED` and a two-minute lease, so overlapping dispatchers or API instances never send the same row twice at the same time.
- Sent rows become `SENT` with `sent_at`. Failures are retried after 30 s, 60 s, 120 s, 240 s; after 5 attempts the row becomes `FAILED` with the last error. Delivery is at-least-once: a crash between sending and recording could resend one email.
- Mail failures never affect orders; the order is committed before anything is sent.
- If the restaurant has no contact email, no email is queued; the dashboard's live alerts still work.

## Kitchen view and receipts

- **Kitchen:** two columns (to start, cooking), oldest first, large text with options, extras and customer notes, one-tap Start/Ready. Tickets turn red after 20 minutes in the same status.
- **Receipt:** `/orders/:orderId/receipt` renders an 80 mm receipt; the dashboard chrome is hidden when printing.

## Customer tracking

The public tracking page still shows only the status timeline, the customer's own items, totals, masked phone and address. Rider names and phones, rejection/cancellation/delivery-failure reasons, staff names and ids are never included (tested).

## Configuration

| Variable                                 | Default | Notes                              |
| ---------------------------------------- | ------- | ---------------------------------- |
| `NOTIFICATION_DISPATCH_INTERVAL_SECONDS` | `15`    | API. `0` turns the dispatcher off. |

## Tests

- API integration (`test/integration/order-operations.int-spec.ts`, 18 tests): listing, filters, counts and detail; organization and branch isolation; per-role transitions; invalid, stale and simultaneous transitions; reasons, history, audit and payment effects; rider CRUD and role checks; assignment within branch, reassignment, dispatch, failed delivery and availability; customer tracking privacy; outbox de-duplication, single delivery with overlapping dispatchers, retries and permanent failure; the SSE stream (scoping, reconnect, access).
- API unit: transition permissions and rider rules per role, retry backoff.
- Dashboard unit: reconnect/backoff logic, orders board, detail actions and reason dialog, rider assignment, kitchen tickets, receipt, live banners and offline fallback, riders page.
- Browser (Playwright, mobile and desktop): a live order arriving on the board, accept → kitchen → rider → delivered; reject with reason; printable receipt.
