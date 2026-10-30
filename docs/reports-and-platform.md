# Reports and platform administration

## Restaurant reports

**Reports** in the dashboard (owners and managers; platform support and super admins can also read them). Every figure is a database aggregation over the restaurant's own orders. Nothing is estimated from samples or filled in.

### Scope and dates

- Reports are always limited to the restaurant in the URL. Staff whose membership is tied to one branch only ever see that branch, whatever `branchId` they send; others can filter by branch (a branch of another restaurant is rejected with `400`).
- A range is `from`–`to`, inclusive, as **calendar days in the restaurant's time zone** (default `Asia/Karachi`). A day runs from local midnight to the next local midnight; boundaries are computed in the API with the time-zone database and handle daylight saving, so they don't depend on the database server's time zone. The response echoes the exact UTC instants used (`range.startsAt`, `range.endsAt`).
- Orders count on the day they were **placed**. Payments count on the day they were **recorded** (`paid_at`).
- At most 366 days per report.

### Definitions

| Figure                  | Definition                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Placed                  | Orders placed in the period, in any status                                                                                       |
| Completed               | `DELIVERED` or `COMPLETED` (picked up)                                                                                           |
| Cancelled / rejected    | `CANCELLED` (restaurant or customer) and `REJECTED`, shown separately                                                            |
| In progress             | Placed in the period and not finished yet                                                                                        |
| Gross order value       | Sum of item subtotals (options + extras × quantity) of completed orders, before discounts                                        |
| Discounts               | Order discounts + delivery discounts on completed orders                                                                         |
| Delivery charges        | Delivery fees minus delivery discounts on completed orders                                                                       |
| Tax recorded            | Tax stored on completed orders (whether included in prices or added)                                                             |
| Order totals            | What customers were charged for completed orders (including delivery, tax and cash rounding)                                     |
| Refunds                 | `refunded_amount_minor` on payments of completed orders                                                                          |
| **Estimated net sales** | Gross order value − order discounts − tax included in prices − refunds. Excludes delivery charges and added tax. **Not profit.** |
| Average order value     | Order totals ÷ completed orders (rounded half-up); empty when there are none                                                     |
| Recorded payments       | Payments with status `SUCCEEDED`, `PARTIALLY_REFUNDED` or `REFUNDED` whose `paid_at` is in the period, minus their refunds       |
| Popular items           | Top 10 products by quantity in completed orders, with their item sales                                                           |

Cancelled and rejected orders never contribute money. Ingredient, labour, rent, payment fees and other costs are not recorded, so **no figure is profit**; the dashboard says so next to the numbers.

### Export

`GET /organizations/:id/reports/orders.csv?from&to[&branchId]` (same permission and scope) downloads one row per order: number, local time and date, branch, type, status, item count, payment method and status, and the money columns in rupees. **No customer names, phone numbers or addresses.** Cells that start with `= + - @` are prefixed with `'` so spreadsheets don't run them as formulas. Exports are limited to 20,000 orders and are recorded in the audit log (`report.orders_exported`).

## Platform administration

`/platform` in the dashboard, linked from the account menu for users with a platform role. **The API enforces every rule**: each `/api/v1/platform/*` route requires a platform role, and routes that change data require `SUPER_ADMIN`. Hiding links is only cosmetic.

| Area                                                                                 |       Support       | Super admin | API                                            |
| ------------------------------------------------------------------------------------ | :-----------------: | :---------: | ---------------------------------------------- |
| Restaurant list, search (name, slug, owner email), status filter, pagination         |          ✓          |      ✓      | `GET /platform/organizations`                  |
| Restaurant detail (owner, contacts, branches, activity, subscriptions, recent audit) |          ✓          |      ✓      | `GET /platform/organizations/:id`              |
| Suspend / reactivate / close (reason required)                                       |                     |      ✓      | `PATCH /platform/organizations/:id/status`     |
| Assign a plan (replaces the current subscription; reason required)                   |                     |      ✓      | `PUT /platform/organizations/:id/subscription` |
| Plans list / create                                                                  |        list         |      ✓      | `GET`, `POST /platform/plans`                  |
| Subscription overview                                                                |          ✓          |      ✓      | `GET /platform/subscriptions/overview`         |
| Audit log (filter by restaurant, action prefix)                                      | ✓ (no IP addresses) |      ✓      | `GET /platform/audit-logs`                     |
| Operational health                                                                   |          ✓          |      ✓      | `GET /platform/health`                         |
| Restaurant CSV export                                                                |                     |      ✓      | `GET /platform/organizations/export.csv`       |

- **Status changes** send the status the admin saw (`expectedStatus`) and are applied conditionally, so two admins can't overwrite each other. Suspending blocks staff access (`403`) and takes the storefront offline (`404`); reactivating restores both. **Closed restaurants cannot be reopened.**
- **Subscriptions:** assigning a plan cancels the current subscription and creates a new one with the plan's price as it is today (the database allows one current subscription per restaurant). No payment is taken; billing is manual.
- **Subscription overview** counts by status and plan, trials ending within 7 days, restaurants with no current plan, past-due accounts, and the _monthly list price of active plans_ (yearly ÷ 12). That last figure is plan prices, not collected revenue.
- **Health** reports database latency, API uptime, orders in the last hour, new orders waiting over 15 minutes, the notification queue (pending, failed in 24 h, oldest pending), live dashboard connections on this API instance, and restaurants by status.

### Audit trail

Every sensitive platform action is written to `audit_logs` in the same transaction as the change, with the acting user, the restaurant, the entity, the details (including the **reason**), IP address and user agent:

| Action                                 | When                                    |
| -------------------------------------- | --------------------------------------- |
| `platform.organization_status_changed` | Suspend, reactivate, close              |
| `platform.subscription_assigned`       | Plan assigned (includes replaced plans) |
| `platform.plan_created`                | New plan                                |
| `platform.organizations_exported`      | Restaurant CSV export                   |
| `report.orders_exported`               | A restaurant's order export             |

Audit entries are append-only (enforced by the database). Platform roles themselves are still granted only by a reviewed database change (see [auth.md](auth.md)).

### Personal data

The platform list shows the owner's name and email (needed for support) but no customer data. Reports and exports contain no customer names, phones or addresses. IP addresses in the audit log are visible to super admins only.

## Tests

- API integration (`test/integration/reports-platform.int-spec.ts`, 17 tests): local-midnight boundaries in Asia/Karachi, cancelled/rejected/refunded treatment, every money figure, quiet periods, payments by payment date, branch scoping and forced branch scope, cross-tenant isolation and report permissions, date validation, CSV without customer data and its audit; platform access for restaurant users (403), anonymous (401), support (read-only) and super admin; search, filters and pagination; suspend/reactivate with reason, stale status and audit details; closed restaurants; plans and subscription replacement with audit completeness; audit visibility (IP hidden from support); CSV export and its audit; health from live data.
- API unit: time-zone day boundaries including daylight saving, CSV escaping.
- Dashboard unit: date presets in the restaurant's time zone, reports page (definitions, not-profit notice, range/branch/export link, empty periods), platform area (blocked without a role, search, support read-only, reason required to suspend).
- Browser (Playwright, mobile and desktop): a completed and a cancelled order appear correctly in today's report, and the CSV download contains no customer details.
