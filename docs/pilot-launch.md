# Pilot launch checklist

For the first 3–5 restaurants. Work through it on **staging** with a test restaurant first, then for each pilot restaurant on production. The production steps can only start once the manual setup in [deployment.md](deployment.md#manual-steps-that-need-account-access-or-approval) is complete.

The platform team member who runs a restaurant's onboarding is that restaurant's **pilot contact** for the first two weeks.

## 0. Before the first restaurant

- [ ] The production setup in [deployment.md](deployment.md) is done and its release checklist passed.
- [ ] The edge proxy sets `X-Forwarded-For`. Ten failed sign-ins from one phone lock only that account, and other people can still sign in.
- [ ] An uptime alert reaches the on-call phone. Test it by stopping the staging API.
- [ ] Restore test against a scratch Supabase project passed and was timed.
- [ ] The pilot plan exists (Platform → Plans): price, limits, trial length and grace days agreed with the business owner, and set as the **default** plan if new restaurants should start a trial automatically.
- [ ] `BILLING_PAYMENT_INSTRUCTIONS` shows the real bank or wallet account.
- [ ] A **platform test restaurant** exists for smoke tests, and it is kept out of real customers' way: suspended between tests, or its link never shared.
- [ ] A shared support WhatsApp number or group and an on-call rota are set up (see [§7](#7-support-and-escalation)).

## 1. Restaurant onboarding (about 1 hour, ideally on site)

The owner should do the steps themselves, with the pilot contact beside them, so they learn the dashboard.

- [ ] **Owner account:** the owner signs up at `https://app.<domain>/signup` with their own email and confirms it from their inbox. Check the email arrives and isn't in spam.
- [ ] **Restaurant:** name and **slug**. The slug becomes the permanent link `https://order.<domain>/r/<slug>`: short, lower-case, and the restaurant's own name.
- [ ] **Onboarding steps**, in the app's order:
  - **profile** — description, contact phone, and a **contact email** (staff order alerts go there);
  - **branch** — address, area, city, phone;
  - **hours** — opening hours per day, in Asia/Karachi time.
  - **fulfillment** — delivery and/or pickup, preparation minutes, delivery fee, minimum order, delivery estimate;
  - **review** — completing it takes the storefront live.
- [ ] **Staff accounts:** invite each person with their own email and the narrowest role:

  | Role          | For                                                               |
  | ------------- | ----------------------------------------------------------------- |
  | Manager       | Everything except billing                                         |
  | Order staff   | Accepts, rejects, dispatches and completes orders; assigns riders |
  | Kitchen staff | Start preparing and mark ready only                               |

  Branch-limited staff only see their branch. Nobody shares a login.

- [ ] **Riders:** add each rider under Riders, with name, phone, vehicle and branch. Riders do **not** sign in. There is no rider app yet, and the _Rider_ staff role gives access to no screens. Don't invite riders as members.
- [ ] **Plan:** check the restaurant appears in Platform → Restaurants with the right plan and trial end date. Restaurants created before billing existed have no plan, which means no limits and ordering stays on. Assign one deliberately.
- [ ] **Hand over the storefront link,** a QR code of it, and the support number.

## 2. Menu import

There is **no bulk or CSV menu import**. Menus are entered in the dashboard.

- [ ] Before the visit, collect the menu in a simple sheet with these columns:
  - category;
  - item name and description;
  - variants with prices in rupees (e.g. Half / Full);
  - add-on groups with min/max choices and prices (e.g. "Bread — choose 1");
  - photo file.
- [ ] Create the add-on groups first, then the categories, then the items. Attach the groups to each item.
- [ ] **Photos:** JPEG, PNG or WebP, up to 5 MB, roughly square. Items without photos are fine.
- [ ] Leave items as **Draft** until checked, then **Publish**. Use **Available** off for items that are sold out today.
- [ ] Check the plan's item limit. If entry stops with "Your … plan includes N menu items", either raise the plan or merge variants.
- [ ] **Check:** open the storefront on a phone and compare every price against the paper menu. Budget about 1 minute per item for entry and checking.

## 3. Test orders (before announcing to customers)

Use the restaurant's real storefront link with the owner watching the dashboard on the device staff will use. For each order, name the customer **"TEST – do not cook"** so the kitchen ignores it.

- [ ] **Delivery, cash:** place an order with an address in the delivery area. Then check:
  - the dashboard plays the chime and shows the banner within seconds;
  - the staff email arrives;
  - **Accept** → **Start preparing** (from the kitchen screen) → **Ready** → assign a rider → **Out for delivery** → **Delivered**;
  - the customer's tracking page updates at each step.
- [ ] **Pickup:** place an order, then **Accept** → … → **Picked up**.
- [ ] **Customer cancel:** cancel from the tracking page while the order is pending. After the restaurant accepts, cancelling is no longer possible.
- [ ] **Reject** an order with a reason. The customer sees "rejected" but not the reason.
- [ ] **Delivery failed** → back out → **Delivered**, to practise the retry.
- [ ] **Closed hours:** outside opening hours, the storefront says the restaurant is closed and does not take the order.
- [ ] **Receipt:** print one from the order page on the restaurant's printer, if they have one. It is formatted for 80 mm.
- [ ] Test orders stay in reports, because orders are never deleted. Note their order numbers so they can be left out of the first week's reconciliation.

## 4. Cash-on-delivery reconciliation (end of every shift)

An order is marked **paid only** when staff press **Delivered** (or **Picked up**). The payment is then recorded with the time and the rider who collected it. Nothing is marked paid at placement.

1. Reports → today → note **Order totals** and **Recorded payments** for the branch.
2. Orders → **Delivered** tab for the shift (delivered and picked-up orders). For each rider, add up the totals of the orders they carried. The rider is shown on each order.
3. Count each rider's cash and compare it with their total. Write differences in a shared sheet: date, rider, expected, received, reason.
4. Export **orders.csv** for the day and keep it with the cash sheet. The export has no customer data, so it is safe to share with an accountant.
5. **Orders still "Out for delivery" at close** were either not delivered, or delivered but not marked. Resolve them **before** counting cash.

Known gaps:

- The app has no per-rider cash report and no "cash handed in" step. The rider total in step 2 is added up by hand.
- The CSV export has no rider column.

Track how long reconciliation takes. It decides whether a rider cash report is the next feature.

## 5. Rider workflow (pilot)

1. Order staff assign an available rider on the order page. Only riders of that branch who are active and not on another delivery can be chosen.
2. Staff give the rider the details: print the receipt, or read out the order number, address, landmark and phone from the order page. No customer details go into personal WhatsApp groups.
3. Staff press **Out for delivery** when the rider leaves. The rider then shows as _on delivery_ and cannot be reassigned or deactivated.
4. The rider calls the shop on arrival or on a problem. Staff press **Delivered** (cash collected) or **Delivery failed** with a reason (customer unreachable, wrong address, refused).
5. A failed delivery can be retried, with the same or another rider, or cancelled with a reason.
6. Riders can mark themselves off duty only through staff: Riders → availability.

## 6. Staff training (30–45 minutes per shift team)

- [ ] **Everyone:**
  - signing in on their own account;
  - signing out on shared tablets;
  - what the **red "live updates offline"** banner means (lists refresh every minute; check the internet connection).
- [ ] **Order staff:**
  - accept or reject within a few minutes (the customer is waiting on the tracking page);
  - reasons for rejecting or cancelling;
  - assigning riders;
  - if the app says the order has already changed, another staff member acted first, so check the new status and continue;
  - the shift-end reconciliation (§4).
- [ ] **Kitchen:** the kitchen screen, Start → Ready, and that tickets turn red after 20 minutes.
- [ ] **Managers:**
  - marking menu items unavailable;
  - changing hours;
  - inviting and removing staff;
  - reading the report.
  - Reports show sales, **not profit**.
- [ ] **Owner:**
  - Billing → how to record a payment with the transaction reference and receipt;
  - a payment counts only after the platform verifies it;
  - what happens in grace and suspension: ordering pauses, and data is never deleted.
- [ ] **Emergency stop:** there is no "pause orders" button. To stop new orders now:
  - a manager clears **today's opening hours** for the branch, and the storefront then shows "closed";
  - or marks items unavailable;
  - in a real emergency, the platform super admin can suspend the restaurant.

  Orders already placed must still be handled or cancelled with a reason.

- [ ] Leave a one-page printed guide with these steps and the support number at the counter.

## 7. Support and escalation

| Level | Who                                                      | Handles                                                                                                                  | Target response (pilot hours)            |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| L1    | Pilot contact (WhatsApp group with the restaurant)       | how-to questions, menu changes, password resets (users reset their own from the sign-in page), staff invites             | 15 min                                   |
| L2    | Platform support (dashboard **Support** role, read-only) | looks at the restaurant, orders and audit log to diagnose. Gets the request id from the error or the time of the problem | 1 hour                                   |
| L3    | Engineer on call (super admin)                           | outages, wrong data, payment verification, suspending or unsuspending, plan changes. Uses the logs by request id         | 15 min for an outage, same day otherwise |

**Severity and first actions:**

- **Outage** — storefront or dashboard down, or orders not arriving:
  1. Check `/healthz`, `/api/v1/health/ready` and Platform → Health.
  2. Post in the restaurants' groups: "Please take phone orders for now."
  3. Fix or roll back ([deployment.md](deployment.md#rollback-and-recovery)).
- **Data or security concern** — someone sees another restaurant's data, a wrong price is charged, or a suspected account takeover:
  1. Collect screenshots and the time.
  2. Do not change data.
  3. The engineer on call checks the audit log. If needed, the user resets their password (this signs out every session), or the owner suspends the member.
  4. Record the incident.
- **Billing dispute** — verify against the bank or wallet statement. Never mark a payment verified without seeing the money arrive, and never verify a payment you recorded yourself (the app refuses this too).

Keep a simple incident log: time, restaurant, what happened, request id, fix, follow-up.

## Daily monitoring

Every morning before lunch service (about 10 minutes), and again before dinner during the first week:

- [ ] **Platform → Health:**
  - database up;
  - pending notifications near 0;
  - **failed notifications (24 h)** — if above 0, check the SMTP credentials and the restaurant's contact email;
  - **orders pending > 15 minutes** — call that restaurant;
  - live connections roughly matching the open restaurants.
- [ ] **Uptime monitor:** no alerts overnight, or alerts explained.
- [ ] **Error logs** (`"level":"error"`, plus 5xx counts in the access log): look at anything new and note its request id.
- [ ] **Platform → Payments:** review waiting payments the same day.
- [ ] **Platform → Overview:**
  - trials ending in 7 days — talk to the owner before the first invoice;
  - past-due restaurants;
  - suspended restaurants.
- [ ] **Each pilot restaurant:**
  - yesterday's orders in Reports;
  - any order still not finished from yesterday;
  - the shift-end cash sheet filled in.
- [ ] **Weekly:**
  - logical backup and bucket copy;
  - `pnpm audit --prod`;
  - read the incident log;
  - check what the restaurants have asked for.

## Pilot exit criteria (decide after 2–4 weeks)

- Orders reached the restaurant and were accepted within 5 minutes in most cases, with no missed orders.
- Cash reconciliation differences were explained every day.
- No cross-restaurant data issue and no unrecovered outage.
- Restaurants can run a shift without the pilot contact.
- The list of missing features is ranked, for example a rider cash report, menu import, a pause button, a rider app and custom domains.
