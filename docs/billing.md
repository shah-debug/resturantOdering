# SaaS plans, subscriptions and billing

Restaurants pay the platform a monthly (or yearly) subscription. For the pilot, payment is manual: the restaurant pays by bank transfer or mobile wallet, records the payment in the dashboard, and a platform super admin checks it against the statement before it counts. No payment gateway or recurring billing is integrated.

## Plans

A plan has a code, name, price (integer paisa, PKR), billing interval, trial length, grace period, limits and an active flag. Limits apply immediately to every restaurant on the plan. An empty limit means unlimited.

| Limit         | What is counted                  |
| ------------- | -------------------------------- |
| `maxBranches` | Branches that are not closed     |
| `maxProducts` | Menu items that are not archived |
| `maxRiders`   | Active riders                    |
| `maxMembers`  | Active and invited team members  |

Exactly one active plan may be the **default**. A new restaurant starts a free trial on it when its trial length is above zero. Price changes apply to new subscriptions only, because a subscription copies the price when it starts.

Plans are managed by super admins at `POST /platform/plans` and `PATCH /platform/plans/:id`, and every change is audited.

## Subscription states

| Status      | Meaning                                                | Standing   |
| ----------- | ------------------------------------------------------ | ---------- |
| `TRIALING`  | Free trial                                             | good       |
| `ACTIVE`    | Paid period                                            | good       |
| `PAST_DUE`  | Period ended without a verified payment; in grace      | grace      |
| `SUSPENDED` | Grace ended; online ordering paused                    | restricted |
| `CANCELED`  | Cancelled by a super admin, now or at period end       | restricted |
| `EXPIRED`   | Suspended for `BILLING_EXPIRE_AFTER_DAYS` (default 60) | restricted |

A restaurant with no subscription at all is **unmanaged**. Restaurants that existed before billing are unmanaged until a plan is assigned. They have no limits and keep taking orders.

The allowed transitions live in `apps/api/src/modules/billing/domain/subscription-status.ts`:

```
TRIALING  → ACTIVE (invoice paid) | PAST_DUE | CANCELED
ACTIVE    → ACTIVE (renewal)      | PAST_DUE | CANCELED
PAST_DUE  → ACTIVE (paid)         | SUSPENDED | CANCELED
SUSPENDED → ACTIVE (reactivated)  | EXPIRED  | CANCELED
CANCELED, EXPIRED → (final; assign a new plan to start again)
```

Each status change uses a conditional update on the expected status, so two workers cannot apply the same change twice. Every change is written to the audit log as `billing.subscription_status_changed`. When the background job made the change, the actor is empty.

## Billing calendar and timezones

Periods start and end at **local midnight in the restaurant's timezone**, for example 19:00 UTC in Asia/Karachi. Each subscription keeps a `billingAnchorDay`, the day of the month its periods start on.

- If the anchor day does not exist in a month, the period starts on that month's last day. An anchor of 31 gives 28 or 29 Feb, 30 Apr, and 31 May.
- A trial starts at local midnight today and ends after the plan's trial length in whole local days. Its first invoice covers the trial end up to the next anchor date, and is due when the trial ends.
- Assigning a plan as **Active** grants the first period without an invoice. Use it only when payment has been agreed separately.
- Reactivating a suspended subscription starts a new period from local midnight on the day of verification and moves the anchor to that day. A past-due subscription that is paid keeps its current period.

The calendar code is in `domain/billing-calendar.ts` and has unit tests for month ends, leap years and Asia/Karachi local-midnight boundaries.

## Lifecycle job

`BillingLifecycleService` runs every `BILLING_LIFECYCLE_INTERVAL_SECONDS` (default 900), and super admins can run it on demand with `POST /platform/billing/run`. Every step can be safely repeated. For each current subscription it does the following:

1. **Invoice:** creates the next period's invoice 7 days before the period ends. Invoices are unique per subscription and period.
2. **Renewal reminders:** emails at 7, 3 and 1 local days before the due date, with one email per threshold (deduplicated).
3. **Period end:** if the next invoice is paid, the period rolls forward. Otherwise the subscription becomes `PAST_DUE`, with `graceEndsAt` set to the period start plus the plan's grace days.
4. **Grace ending:** sends one reminder a day before grace ends.
5. **Suspension:** at `graceEndsAt` the subscription becomes `SUSPENDED`.
6. **Expiry:** after `BILLING_EXPIRE_AFTER_DAYS` suspended, it becomes `EXPIRED`.
7. **Cancel at period end:** the subscription becomes `CANCELED` and its open invoices are voided.

Emails go through the notification outbox described in [orders.md](orders.md). They are sent to the restaurant's contact email, or the owner's email when there is no contact email.

## What a restricted subscription does

Nothing is deleted. A restricted standing (`SUSPENDED`, `CANCELED` or `EXPIRED`) affects the restaurant as follows:

- **Storefront:** the storefront stays online with its menu, but returns `onlineOrdering: false`. Checkout quotes and orders fail with `STORE_CLOSED`: "This restaurant is not taking online orders right now". The order transaction checks this too.
- **Dashboard:** all data stays readable, and existing orders can still be moved through the kitchen and to delivery.
- **Adding resources:** adding branches, menu items, riders or members returns `402 SUBSCRIPTION_INACTIVE`.
- **Limits:** going over a plan limit returns `409 PLAN_LIMIT_REACHED`, with a message that names the plan and the limit.
- **Banner:** the dashboard shows a banner to every staff member. Users who can read billing see the details and a link to the Billing page.

During `PAST_DUE` (grace), the restaurant keeps working normally and the banner shows when grace ends.

## Manual payments

1. **Recording a payment.** The owner opens **Billing** and records a payment against an open invoice (`POST /organizations/:id/billing/payments`, multipart). The payment includes:
   - the payment method;
   - the amount;
   - the date paid (no later than today in local time, and within the last year);
   - the transaction or receipt reference;
   - an optional note;
   - an optional receipt (JPEG, PNG, WebP or PDF, up to 5 MB). The file type is checked from its content, not its name.
2. **Waiting for review.** The payment is `SUBMITTED`, and recording it **never** marks the invoice paid.
3. **Review.** A super admin reviews it in **Platform → Payments** (`POST /platform/billing/payments/:id/review`).
   - **Verify:** records the reviewer and the time. When verified payments cover the invoice amount, the invoice becomes `PAID`, and a past-due or suspended subscription is reactivated.
   - **Reject:** needs a reason, which the restaurant sees and receives by email.
4. **Four-eyes rule.** A reviewer cannot review a payment they recorded themselves. This is enforced by the API (409) and by a database CHECK.
5. **Double review.** A payment can be reviewed once. The update is conditional, so a second review returns 409.

**Repeated references.** A reference is normalized: upper case, with spaces, dashes and other separators removed. It must be unique per payment method across all restaurants, unless the earlier payment was rejected. This is enforced by a partial unique index, so the same bank transaction cannot pay two invoices. The same reference under a different method is allowed.

**Permissions**

| Action                                    | Who                              |
| ----------------------------------------- | -------------------------------- |
| See billing state and invoices            | Owner, manager, support member   |
| Record a payment                          | Owner (`billing:manage`)         |
| See the payment queue and receipts        | Platform support and super admin |
| Verify or reject, cancel, edit plans, run | Super admin only                 |

**Receipts** are kept in private storage. In development this is `apps/api/uploads/.private`. In production it is the private Supabase bucket `STORAGE_PRIVATE_BUCKET` (default `billing-evidence`). They are never served from `/media`, and can only be downloaded through these authorized endpoints, with `Cache-Control: private, no-store`:

- `GET /organizations/:id/billing/payments/:paymentId/evidence`
- `GET /platform/billing/payments/:id/evidence`

All submissions and reviews are audited:

- `billing.payment_submitted`
- `billing.payment_verified`
- `billing.payment_rejected`

## Cancelling

A super admin can cancel a subscription **now** or **at the end of the period**, giving a reason that is audited. Cancelling now voids its open invoices. To start again, assign a new plan.

## Future payment gateway

`providers/payment-provider.ts` defines `PaymentProvider`. The only implementation today is `ManualPaymentProvider`. Any gateway added later (for example a card processor or a JazzCash/Easypaisa merchant integration) must meet these requirements:

- Use a confirmed provider and merchant account first. None is integrated yet.
- Verify every webhook with `verifyWebhookSignature`:
  - HMAC-SHA256 over `timestamp.body`;
  - header format `t=…,v1=…`;
  - a 300-second tolerance;
  - timing-safe comparison;
  - the secret is read from the environment.
- Store each event with a unique `(provider, provider_event_id)` and ignore repeats, so retries are idempotent.
- Record a gateway payment as a `subscription_payment` that has been verified by the provider. A transfer that has not been verified must never mark an invoice paid.

## Configuration

| Variable                             | Default            | Purpose                                  |
| ------------------------------------ | ------------------ | ---------------------------------------- |
| `BILLING_LIFECYCLE_INTERVAL_SECONDS` | `900`              | Lifecycle job interval; `0` turns it off |
| `BILLING_EXPIRE_AFTER_DAYS`          | `60`               | Days suspended before expiry             |
| `BILLING_PAYMENT_INSTRUCTIONS`       | unset              | Bank and wallet details shown to owners  |
| `STORAGE_PRIVATE_BUCKET`             | `billing-evidence` | Private Supabase bucket for receipts     |

## Database

These migrations add the billing schema:

- `20261101090000_subscription_suspended` adds the enum value.
- `20261101090100_billing` adds invoices, payments, plan fields, subscription dates, the invoice number sequence, CHECK constraints and RLS.

Apply them with `pnpm --filter @app/api db:migrate:deploy`. Existing data is kept; existing subscriptions get their anchor day from their current period start.

## Tests

- **Unit** (`domain/billing-domain.spec.ts`, `providers/payment-provider.spec.ts`):
  - month-end and leap-year anchors;
  - Asia/Karachi local-midnight and day-count boundaries;
  - the transition table;
  - reminder thresholds;
  - webhook signatures (valid, tampered, stale, malformed).
- **Integration** (`test/integration/billing.int-spec.ts`):
  - trial at local midnight;
  - unmanaged restaurants;
  - every plan limit, including rider reactivation;
  - private receipts;
  - repeated references (spacing, other restaurants, other methods);
  - payment validation;
  - owner-only submission;
  - review permissions, the four-eyes rule and double review;
  - reminders without duplicates;
  - past due and grace;
  - suspension and its storefront and dashboard effects;
  - reactivation with a new period;
  - advance renewal;
  - cancel at period end;
  - expiry with data kept.
- **Dashboard** (`features/billing/billing.test.tsx`):
  - notices for each state;
  - usage and limits;
  - the payment form and its multipart body;
  - the server error for a repeated reference;
  - manager read-only access;
  - the staff banner;
  - the review queue: support read-only, reject needs a reason, verify, and the four-eyes error.
