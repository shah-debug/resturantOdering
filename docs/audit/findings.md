# Findings register

Severity: **High** means a security or data-loss risk that a realistic attacker or ordinary use can trigger. **Medium** means real harm under specific conditions. **Low** means hardening, privacy or a small integrity issue. Each fixed finding has a regression test. For a security fix, the test was run **without the fix first** and failed.

## AUD-01 · Parallel wrong passwords bypassed account lockout — High · Fixed

- **Where:** `auth.service.ts` `recordFailedLogin`.
- **Problem:** the lock decision used the failure count read **before** checking the password. Requests in flight together all saw the same count, so none of them locked the account and brute force was unlimited apart from the per-IP rate limit.
- **Evidence:** a new test sent 6 simultaneous wrong passwords with a threshold of 3. Before the fix, the correct password then signed in: `expected 423 "Locked", got 200 "OK"`.
- **Fix:** an atomic `failed_login_attempts + 1 … RETURNING`. The lock is set by a conditional update once the returned count reaches the threshold.
- **Test:** `auth.int-spec.ts`, "still locks the account when wrong passwords arrive all at once". The suite passes 20/20.

## AUD-02 · Lockout reveals that an account exists — Low · Open (accepted)

After the threshold, a known email gets `423 ACCOUNT_LOCKED`, while an unknown email always gets `401`. Ten guesses therefore show that an email is registered. This is the usual trade-off of per-account lockout, and the per-IP limit of 10 per minute slows it down.

## AUD-03 · Password-reset and verification emails can be used to flood an inbox — Low · Open

The limit is 10 requests per minute **per IP**. Someone with many IPs can send repeated reset emails to one address. Each new token invalidates the previous one, so this is only a nuisance. A per-account cooldown (for example one email per 2 minutes) would close it.

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

## AUD-05 · Unlimited restaurants per user, each with a new trial — Low · Open

Any verified user can create any number of organizations, and each starts a trial on the default plan. This is a business-abuse risk, not a security one. Options: one trial per owner email, or creation by invitation during the pilot.

## AUD-06 · No customer verification for cash orders — Medium (business) · Open

- **Fake orders:** anyone can place a cash order with any phone number. Rate limits (10 orders per minute per IP) are the only control. Fake orders waste food and rider time.
- **Unused block flag:** `customers.blocked_at` exists and checkout honours it, but no API or UI sets it.

Mitigations before scale: phone OTP, or a confirmation call for first orders; a "block this customer" action for managers.

## AUD-07 · A new order overwrites the stored customer name — Low · Open

The checkout upsert `ON CONFLICT (organization_id, phone) DO UPDATE SET full_name = …` lets whoever orders with a phone number rename that customer in the restaurant's records. Orders keep their own name snapshot, so order history is unaffected.

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

## AUD-15 · Branch managers can still edit the organization profile and the menu — Low · Open (design)

These are organization-wide by design, since one menu serves all branches. Whether branch managers should change them is a product decision. If not, give branch-scoped managers read-only `menu` and `organization` permissions.

## AUD-16 · Promotion codes can be probed through the public quote endpoint — Low · Open

`POST …/checkout/quote` returns different messages for unknown, expired and fully redeemed codes, and is limited by the general rate limit (100 per minute per IP). Exposure is small today, because no API or UI creates promotions; they exist only in the schema. Before shipping promotions:

- return one generic message;
- put the quote endpoint on the sensitive rate limit when a code is present.

## AUD-17 · Payment-reference uniqueness reveals that a reference exists elsewhere — Low · Open (accepted)

Submitting a reference that another restaurant already used returns `409`. This is required: the same bank transaction must not pay two invoices. It leaks only a yes or no for a reference the submitter already knows.

## Carried over from the production-readiness audit (still open)

| ID there | Finding                                                                              | Status                         |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| H1       | Client IP behind the Next.js rewrite needs an edge proxy that sets `X-Forwarded-For` | Open: deployment step          |
| L1       | `multer` advisory (not exploitable here: no `fileFilter`)                            | Open: upgrade after 2026-11-05 |
| L4       | Plan limits can be exceeded by concurrent creates                                    | Open                           |
| L5       | Tracking links never expire                                                          | Accepted                       |
| Info     | Single API instance (in-memory rate limits and events)                               | Open: architecture             |
