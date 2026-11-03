# Findings register

Severity: **High** means a security or data-loss risk that a realistic attacker or ordinary use can trigger. **Medium** means real harm under specific conditions. **Low** means hardening, privacy or a small integrity issue. Each fixed finding has a regression test. For a security fix, the test was run **without the fix first** and failed.

## AUD-01 · Parallel wrong passwords bypassed account lockout — High · Fixed

- **Where:** `auth.service.ts` `recordFailedLogin`.
- **Problem:** the lock decision used the failure count read **before** checking the password. Requests in flight together all saw the same count, so none of them locked the account and brute force was unlimited apart from the per-IP rate limit.
- **Evidence:** a new test sent 6 simultaneous wrong passwords with a threshold of 3. Before the fix, the correct password then signed in: `expected 423 "Locked", got 200 "OK"`.
- **Fix:** an atomic `failed_login_attempts + 1 … RETURNING`. The lock is set by a conditional update once the returned count reaches the threshold.
- **Test:** `auth.int-spec.ts`, "still locks the account when wrong passwords arrive all at once". The suite passes 20/20.

## AUD-02 · Lockout revealed that an account exists — Low · Fixed

- **Problem:** after the threshold, a known email got `423 ACCOUNT_LOCKED` while an unknown email got `401`, so ten guesses showed whether an email was registered.
- **Fix:**
  - while an account is locked, sign-in returns the **same** `401 INVALID_CREDENTIALS` response as an unknown email, after the same dummy-hash work, so the timing matches too;
  - the owner gets a "Sign-in paused after failed attempts" email when the lock starts, so a real user is not left confused.
- **Test:** `auth.int-spec.ts`, "locks the account after repeated failures without revealing that it exists". Code, message and status match the unknown-email response, and the email is sent. The burst test (AUD-01) still proves the lock happens.

## AUD-03 · Reset and verification emails could flood an inbox — Low · Fixed

- **Fix:** at most one password-reset email, and at most one verification email, per account every 2 minutes (`EMAIL_COOLDOWN_MS`). Extra requests still answer `202`, so nothing is revealed. The token's `createdAt` is set from the app's clock.
- **Evidence:** before the fix, 5 requests sent **5** emails (`expected 5 to be 1`).
- **Test:** `auth.int-spec.ts`, "sends at most one reset email per account every two minutes". After the window, the next request sends again.

## AUD-04 · Branch managers could act outside their branch — Medium · Fixed

- **Where:** `memberships.service.ts`.
- **Problem:** a manager limited to one branch could:
  - invite staff with **no branch**, giving org-wide access to every branch's orders and customers, or into another branch;
  - change or remove members of other branches;
  - list every member of the organization.

  The dashboard never sets `branchId` on members, but the API accepts it from owners, so the situation is reachable.

- **Evidence:** before the fix, the new test got `expected 403 "Forbidden", got 201 "Created"` for an org-wide invite by a branch manager.
- **Fix:**
  - invites and branch changes must stay inside the actor's branch (`403`);
  - members of other branches are hidden (`404`);
  - the member list is filtered to the actor's branch.
- **Test:** `tenancy.int-spec.ts`, "keeps a branch manager inside their own branch". The suite passes 24/24.

## AUD-05 · Unlimited restaurants per user, each with a new trial — Low · Fixed

- **Fix:** an owner gets the plan's free trial only once. Any later restaurant they create gets a **one-day** trial, so its first invoice is due at the next local midnight, followed by the plan's normal grace period. It is never "unmanaged", which would mean unlimited and free. The audit entry records `trialAlreadyUsed`.
- **Evidence:** before the fix, the second restaurant got the full 14-day trial again.
- **Test:** `billing.int-spec.ts`, "gives each owner one free trial, and bills later restaurants from tonight". A new owner still gets the full trial.

## AUD-06 · Fake cash orders — Medium (business) · Fixed in the app; SMS verification needs a provider

- **Block numbers:** order staff, managers and owners can block or unblock a customer's number from the order page, giving a reason. The endpoint is `PUT …/orders/:orderId/customer-block` and needs `orders:manage`. Checkout then refuses that number with `CHECKOUT_REJECTED`. Each change is audited (`customer.blocked` / `customer.unblocked`, with the reason).
- **First-order flag:** every order carries `customerOrderCount`. The order page shows **"First order from this number — call to confirm before cooking"**. Prisma computes the count in the same query, so there is no N+1.
- **Kitchen and support** see neither the controls nor the full number.
- **Tests:**
  - `order-operations.int-spec.ts`, "flags first orders and lets order staff block and unblock a number": kitchen gets 403, a reason is required, a blocked number is refused at checkout, unblocking works, and the audit trail is checked;
  - `cross-tenant.int-spec.ts`: blocking another restaurant's customer is refused, and its customer rows are unchanged;
  - `customer-safety.test.tsx` (3 tests).
- **Not done:** one-time-password verification by SMS needs a chosen SMS provider and an account, for example a local aggregator or Twilio. The project rules forbid integrating an unconfirmed provider or a fake one. With a provider confirmed, add an OTP step before the first order from a new number.

## AUD-07 · A new order overwrote the stored customer name — Low · Fixed

- **Fix:** the checkout upsert no longer changes `full_name` for an existing phone number. Each order still keeps the name it was placed with.
- **Evidence:** before the fix, `expected 'Someone Else' to be 'Ayesha Khan'`.
- **Test:** `checkout.int-spec.ts`, "keeps the stored customer name when someone else orders with the same phone". The suite passes 36/36.

## AUD-08 · Kitchen staff and platform support saw full customer phone and address — Low (privacy) · Fixed

- **Problem:** order lists and details returned the full phone number and delivery address to every role with `orders:read`, including kitchen staff and platform support. The kitchen screen uses neither.
- **Fix:** roles without `orders:manage` get the masked phone, the same masking as the customer tracking page, and no delivery address. The dashboard shows a masked phone as text instead of a broken `tel:` link.
- **Test:** `order-operations.int-spec.ts`, "shows order detail…": kitchen sees a masked phone and no address, order staff see both. The suite passes 18/18. The previous test had asserted that kitchen staff see the full phone, and was changed on purpose.

## AUD-09 · Branch managers could change other branches and add new ones — Medium · Fixed

- **Where:** `branches.service.ts`.
- **Problem:** the service ignored the actor's branch scope. A branch-limited manager could create branches, which also counts against the plan, and could change the details, opening hours and delivery settings (fees, minimum order) of any branch.
- **Evidence:** before the fix, a branch manager's `POST /branches` returned `201 Created` when it should have returned `403`.
- **Fix:**
  - branch-scoped actors cannot create branches (`403`);
  - writes to other branches return `404`.

  Reads stay organization-wide, so branch names still appear in staff screens.

- **Test:** `tenancy.int-spec.ts`, "keeps a branch manager inside their own branch". Tenancy and onboarding pass 41/41.

## AUD-10 · Timezone helpers and the CSV export blocked the event loop — Medium (performance) · Fixed

- **Problem:** `partsIn()` in `common/time/zoned-dates.ts` and the orders CSV export created a new `Intl.DateTimeFormat` on **every call or row**. These helpers run under every report, billing-calendar and lifecycle calculation.
- **Evidence:**
  - 20,000 conversions took **2,139 ms** in the regression test, against about 40 ms with a shared formatter;
  - a micro-benchmark showed 1,912 ms with one formatter per row, against 37 ms with a shared one.

  While this runs, the single API instance serves no other request.

- **Fix:** one cached formatter per time zone, and one shared formatter per export.
- **Test:** `zoned-dates.spec.ts`, "stays fast enough for a 20,000-row export…" (bound: 1 s). It fails without the fix.

## AUD-11 · Two partial payments verified at the same time could leave a paid invoice open — Medium · Fixed

- **Problem:** each verification summed the verified payments inside its own transaction. With two admins verifying the two halves at once, under READ COMMITTED each transaction saw only its own payment, so neither marked the invoice `PAID`. The lifecycle job would then have moved a fully paid restaurant to past due.
- **Fix:** the invoice row is locked with `SELECT … FOR UPDATE` and its status re-read before summing.
- **Test:** `billing.int-spec.ts`, "marks an invoice paid only once split payments together cover it" covers the sequential path. The suite passes 14/14. The concurrent interleaving **cannot be reproduced** with the single-connection test database, so the lock was verified by inspection only.

## AUD-12 · Each live-order event caused duplicate refetches — Low (performance) · Fixed

- **Problem:** every SSE event immediately invalidated the order list, the counts and that order's detail on every open dashboard. A staff member's own change was therefore fetched twice: once by their mutation, and again by the event echo that arrives milliseconds later. Bursts, such as a kitchen marking several orders ready, caused one full list and counts refetch per event.
- **Fix:** `InvalidationBatcher` coalesces the events of a 400 ms window into one invalidation with the union of order IDs. Reconnect and stop cancel pending work.
- **Test:** `invalidation-batcher.test.ts` (3 tests): one refresh per burst, no event delayed more than one window, nothing after stop.

## AUD-13 · The tracking page kept refreshing in background tabs — Low (performance) · Fixed

- **Problem:** customers leave the tracking page open. It refreshed (a server render plus an API call) every 30 s even while hidden.
- **Fix:** refreshes only while the tab is visible, and refreshes once immediately when it becomes visible again.
- **Test:** `order-tracking-view.test.tsx`, "only refreshes while the customer is looking…".

## AUD-14 · The post-login redirect check had no tests — Info · Verified

`safeNextPath` was read and found correct: it refuses absolute URLs, protocol-relative URLs, backslashes, whitespace and control characters. The new test `safe-next-path.test.ts` (14 cases) pins the behaviour.

## AUD-15 · Branch managers could edit the organization profile, menu and billing — Low · Fixed

- **Decision:** organization-wide settings belong to owners and organization-wide managers.
- **Fix:** for any role other than owner, a membership limited to a branch loses `organization:update`, `menu:manage`, `billing:read` and `billing:manage` (`ORGANIZATION_WIDE_PERMISSIONS` in `permissions.ts`, applied by the access guard). Reading the menu, orders, riders and reports, and managing members and settings of the manager's own branch, still work.
- **Evidence:** before the fix, a branch manager's rename of the organization returned `200`.
- **Tests:**
  - `permissions.spec.ts`: branch managers lose exactly these four permissions, while owners and organization-wide managers keep them;
  - `tenancy.int-spec.ts`: a branch manager's profile edit and new menu category are `403`, reading the menu is `200`, and billing is `403`.
- **Known limit:** the dashboard does not yet hide these buttons for branch managers, because its role helpers do not look at the branch. The API refuses the action with a clear message. The dashboard never assigns a branch to members today, so this only arises when an owner sets one through the API.

## AUD-16 · Promotion codes could be probed through the quote endpoint — Low · Fixed

- **Fix:**
  - unknown, expired, used-up and already-used codes all return one message, "This code can’t be used". The spend-minimum and delivery-only messages stay, because a real customer needs them;
  - a new `promo` throttler limits quote and order requests that **carry** a `promoCode` (`PROMO_RATE_LIMIT_MAX_REQUESTS`, default 20 per window per IP). Quotes without a code are unaffected.
- **Tests:**
  - `checkout.int-spec.ts`: the four cases are indistinguishable;
  - `rate-limit.e2e-spec.ts`, "limits attempts that carry a promotion code…": 429 after the limit, while code-less and blank-code requests still pass.

## AUD-17 · Payment-reference uniqueness revealed that a reference exists elsewhere — Low · Fixed (mitigated)

- **Why the check stays:** it has to. One bank transaction must never pay two invoices, so a reused reference is always refused.
- **Fix:** probing is now limited and visible:
  - payment submission is on the sensitive rate limit (10 per minute per IP);
  - every refused duplicate is written to the audit log (`billing.payment_reference_duplicate`, with the normalized reference and whether it belongs to **another** restaurant), so platform admins can spot someone probing.
- **Test:** `billing.int-spec.ts`, "rejects repeated references…" now also checks the audit entry (`otherRestaurant: true`).

## Carried over from the production-readiness audit (still open)

| ID there | Finding                                                                              | Status                         |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| H1       | Client IP behind the Next.js rewrite needs an edge proxy that sets `X-Forwarded-For` | Open: deployment step          |
| L1       | `multer` advisory (not exploitable here: no `fileFilter`)                            | Open: upgrade after 2026-11-05 |
| L4       | Plan limits can be exceeded by concurrent creates                                    | Open                           |
| L5       | Tracking links never expire                                                          | Accepted                       |
| Info     | Single API instance (in-memory rate limits and events)                               | Open: architecture             |
