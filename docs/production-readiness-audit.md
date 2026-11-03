# Production-readiness audit

**Date:** 2026-11-03
**Scope:** the whole product as implemented: API, dashboard, storefront, database migrations and configuration. The code and configuration were inspected directly, not taken from earlier completion reports.

> This is an engineering review supported by automated tests and scans. It is **not** a security certification and does not show the product is free of vulnerabilities. No penetration test, load test or third-party review was done.

## Summary

| Severity | Found | Fixed in this phase                             | Open |
| -------- | ----- | ----------------------------------------------- | ---- |
| High     | 1     | Partly (code and docs; deployment step remains) | 1    |
| Medium   | 5     | 5                                               | 0    |
| Low      | 6     | 3                                               | 3    |
| Info     | 3     | —                                               | 3    |

## Findings, most severe first

### H1 · Client IP is spoofable or shared behind the Next.js rewrite — High (deployment-dependent)

**What:** browsers reach the API through the Next.js rewrite `/api/* → API`. The proxy that Next.js bundles (`next/dist/compiled/httpxy`) is created without `xfwd`. It forwards the client's `X-Forwarded-For` unchanged and adds nothing. The API trusts one hop (`TRUST_PROXY_HOPS=1`) and takes the right-most value. If the apps are exposed without an edge proxy that sets the header:

- **No `X-Forwarded-For` sent:** every visitor gets the Next.js server's address. The whole platform then shares one bucket per limit, for example 10 logins per minute for everyone.
- **`X-Forwarded-For` sent by the visitor:** the visitor picks the IP the API sees. Per-IP throttles on login, password reset and order placement are bypassed, and audit-log IPs are forged.

The docs (`architecture.md`, `auth.md`, `.env.example`) wrongly said the Next.js apps "count as one" proxy.

**Evidence:** a probe through the bundled proxy, using the same options as `proxy-request.js`:

```
no XFF from client  -> {"xff":null,"peer":"::ffff:127.0.0.1"}
client-spoofed XFF  -> {"xff":"203.0.113.7","peer":"::ffff:127.0.0.1"}
```

**Fixed:**

- The docs now state the real requirement: one edge proxy or load balancer that appends the visitor's address, `TRUST_PROXY_HOPS` set to the number of such proxies, and the apps never exposed directly. See `operations.md#client-ip-addresses`.
- The server-rendered order-tracking page now forwards the incoming `X-Forwarded-For`, after checking it against a strict pattern. Before this, every tracking page view on the platform shared the Next.js server's bucket. Tests: `storefront-api.test.ts`, 2 new.

**Still open:** this is only safe once production has that edge proxy. That has to be confirmed when the hosting is chosen.

### M1 · Shutdown closed the database pool before in-flight requests finished — Medium

**What:** Nest runs `onModuleDestroy` hooks **before** it closes the HTTP server. The order is `callDestroyHook → callBeforeShutdownHook → dispose() → callShutdownHook`, as seen in `@nestjs/core/nest-application-context.js`. `PrismaService` disconnected in `onModuleDestroy`, so on every deploy (`SIGTERM`), requests still running lost their database connection. The two background workers also cleared their timers without waiting for a batch in progress.

**Fixed:**

- Prisma now disconnects in `onApplicationShutdown`, after the HTTP server has drained.
- Each worker tracks its in-flight batch and `onModuleDestroy` awaits it. Ticks can no longer overlap.
- Readiness returns 503 as soon as shutdown starts.

**Tests:**

- `notification-dispatcher.spec.ts` (2): shutdown waits for the batch, there is no overlap, and failures are reported.
- `health.controller.spec.ts` (+1): readiness is 503 during shutdown.

### M2 · No request timeouts in the browser or in server rendering — Medium

**What:** neither RTK Query's `fetchBaseQuery` nor the storefront's server-side `fetch` had a timeout. A hung API connection left a spinner forever, or tied up a server-rendering worker.

**Fixed:**

- Requests time out after 20 s; the two file uploads are allowed 120 s.
- Server-side storefront fetches time out after 10 s.
- A timeout now shows "The server is taking too long to respond…".

Retrying after a timeout is safe: order placement reuses its `Idempotency-Key` while the cart is unchanged, and dashboard changes use `expectedStatus` checks.

**Tests:** `api-error.test.ts` (+1) and `storefront-api.test.ts` (signal present).

### M3 · An expired session was not sent back to sign-in — Medium

**What:** only the `/auth/me` query triggered the sign-in redirect. When a session expired mid-use (the idle timeout is 24 h), every screen showed "Sign in to continue" errors and stayed there.

**Fixed:** a store listener re-checks `me` after any 401 from a non-auth endpoint, and the existing redirect then runs. A wrong current password (also a 401) does not count as an expired session.

**Tests:** `session-expiry.test.tsx` (2). With the listener removed, the redirect test fails, which confirms the test catches the bug.

### M4 · No structured logs, request ids or error-monitoring hook — Medium

**What:**

- Logs were plain text.
- No request had an id.
- Requests were not logged at all.
- Worker and process-level errors only reached `Logger`, so there was nowhere to attach a monitoring service.

**Fixed:**

- JSON logs in production (`LOG_FORMAT`).
- `X-Request-Id` on every response. A well-formed id from the load balancer is kept; anything else is replaced.
- Access log lines without query strings (`LOG_REQUESTS`).
- An `ErrorReporter` hook used by 5xx responses, both workers, `unhandledRejection` and `uncaughtException`.
- Startup failures are logged and exit with code 1.

**Tests:**

- `request-context.spec.ts` (4): id kept or replaced, header injection refused, query strings never logged, health probes kept quiet.
- `observability.e2e-spec.ts` (3): a 5xx is reported with its request id and without the query; the client gets no details; 4xx is not reported.

### M5 · Mail library with address-parsing advisories — Medium

**What:** `nodemailer` 10.1.1 is affected by GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w and GHSA-85x2-q946-cp5h. These address-parser bugs can deliver mail to a domain the header does not name. Restaurant contact emails are user-entered and are used as recipients.

**Fixed:** upgraded to `nodemailer` 10.1.7 (released 2026-10-18, same minor line). The mailer tests pass (5).

### L1 · `multer` advisory GHSA-q7qp-rjg7-q26m (rated High upstream) — Low here, open

**What:** the advisory is a denial of service through a **pending asynchronous `fileFilter`** after the request is torn down. Neither upload endpoint sets a `fileFilter`; both use only size, file and field limits. `multer` 2.4.0 comes in through `@nestjs/platform-express`.

**Open:** the fixed 2.5.0 was released on 2026-10-22, 12 days before this audit. Upgrade through a pnpm override, or a Nest release that includes it, once it has been out for two weeks.

### L2 · Platform audit log sorted the whole table without an index — Low

**What:** `GET /platform/audit-logs` with no organization filter orders by `created_at DESC, id DESC`. `audit_logs` only had indexes that start with `organization_id`, and it is the fastest-growing table.

**Fixed:** migration `20261103090000_audit_log_recent_index` adds `audit_logs(created_at DESC, id DESC)`. It was generated with `prisma migrate diff` and applies cleanly in all integration runs.

### L3 · Payment-receipt upload allowed unlimited form fields — Low

**Fixed:** the multipart limits are now `fields: 8, parts: 9, fieldSize: 4096`. The form has six text fields and one file.

### L4 · Plan limits can be exceeded under concurrent creates — Low, open

**What:** `EntitlementsService.assertCanAdd` counts usage and then creates the row in a separate statement. Two simultaneous requests at the limit can both succeed. For example, two managers adding the last allowed branch at the same moment end up with one branch over the plan.

This only affects a commercial limit. It does not cross tenants or skip permissions.

**Suggested fix:** take `pg_advisory_xact_lock` per organization and resource inside the create transaction.

### L5 · Order-tracking links never expire — Low, accepted

**What:** the HMAC token in the tracking link does not expire. Anyone holding the link sees:

- the customer's name;
- a **masked** phone number;
- the delivery address;
- the items.

The link is only shared with the customer, is sent with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, and the token is bound to the order and the restaurant. Rotating `ORDER_TRACKING_SECRET` invalidates all links.

**Option:** hide the address after delivery, or after 30 days.

### L6 · Docs gave wrong proxy guidance — Low

**Fixed:** this is part of H1. `architecture.md`, `auth.md` and `.env.example` are corrected.

### Info

- **minimatch** (GHSA-g3hv-75wg-m249, moderate): reached only through the ESLint and TypeScript-ESLint toolchain. It is never in a production bundle or the API runtime.
- **One instance only:** rate-limit counters and live order events are in memory. Running a second API instance needs a shared store and pub/sub first. See `operations.md`.
- **No webhook endpoint is exposed.** The signature verification in `providers/payment-provider.ts` is unit tested (valid, tampered, stale, future, malformed, wrong secret). Idempotency is designed around a unique `(provider, provider_event_id)` and has to be wired in when a gateway is chosen.

## Areas reviewed with no defect found

| Area                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session cookies                    | `__Host-session` in production, plus `HttpOnly`, `Secure` (production), `SameSite=Lax` and `Path=/` (`auth/http/cookies.ts`). Only the SHA-256 hash of the token is stored. Sessions have an absolute and an idle expiry, and suspended users are refused.                                                                                                                                                                                                                                                                                                                                                               |
| CSRF                               | `CsrfGuard` is global. Every non-GET request needs an `Origin` or `Referer` in `APP_ORIGINS`, and `null` is refused. Production origins must use https (env validation).                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CORS                               | Not enabled, by design. Browsers use the same-origin rewrite, so a cross-origin read is blocked by the browser.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Authentication on every route      | All 88 controller routes were listed with their guard. Each one is `@Public()`, `OrganizationRoute(permission)`, `PlatformRoute(role)`, or session-only for `/auth/*` and the user's own organization list.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Authorization and tenant isolation | `OrganizationAccessGuard` returns 404 to non-members and resolves permissions on the server. Every child lookup filters on `organizationId`, and on `branchId` for branch-scoped staff. **New:** `cross-tenant.int-spec.ts` (5 tests) attacks menus, orders and order events, customers (through orders), riders, members, reports and CSV export, onboarding, receipts and files, subscriptions, invoices and payments, plans and every platform administration action. It also checks that the victim's database rows are unchanged afterwards. Removing the tenant filter from the rider lookup makes the suite fail. |
| Order transitions                  | The route needs `orders:read`. Each transition is then checked against role permissions in `canPerformTransition`, and rider assignment needs `orders:manage`.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| SQL safety                         | No `$queryRawUnsafe`, `$executeRawUnsafe` or `Prisma.raw` in application code. All 17 raw queries are tagged templates with bound parameters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Input validation                   | Every body and query goes through a Zod schema (`assertValid` and the global pipe). Body schemas are typed and bounded, and many (rider assignment, plan assignment and payment review, for example) also refuse unknown keys with `.strict()`.                                                                                                                                                                                                                                                                                                                                                                          |
| XSS                                | One `dangerouslySetInnerHTML`, for JSON-LD, escaped through `serializeJsonLd` (`<`, `>`, `&`). Pages use a nonce CSP with `strict-dynamic` and no `unsafe-inline`; `unsafe-eval` is allowed only in development.                                                                                                                                                                                                                                                                                                                                                                                                         |
| File uploads                       | File type is detected from content (magic bytes). Menu images have size, file and field limits. Receipts go to private storage and are served only by authorized endpoints with `no-store`, `nosniff` and a CSP. `/media` refuses receipt keys and path traversal (tested).                                                                                                                                                                                                                                                                                                                                              |
| Secrets                            | `.env` files are git-ignored; only `.env.example` files are committed. A scan of the repository for keys, JWTs and connection strings with passwords found placeholders only. Production startup refuses missing `ORDER_TRACKING_SECRET`, no database CA, the `log` mail transport, local storage and http origins.                                                                                                                                                                                                                                                                                                      |
| Payments and subscriptions         | No automatic paid status. A reviewer cannot verify their own submission (enforced in the database and the API). References are unique per method while not rejected. The storefront and the order transaction both check that the subscription allows ordering (`billing.int-spec.ts`).                                                                                                                                                                                                                                                                                                                                  |
| Unhandled promises                 | `@typescript-eslint/no-floating-promises` is an error in the shared ESLint config, and lint passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| N+1 and indexes                    | Indexes were compared with the query patterns. The loops that write inside a transaction are bounded reorders of IDs already validated for the tenant. The notification dispatcher sends one email per claimed row, which is intended.                                                                                                                                                                                                                                                                                                                                                                                   |
| Polling and live updates           | The SSE client reconnects with back-off (5 s → 60 s). Fallback polling runs **only** while the stream is offline, and a reconnect refetches once. No query polls while the stream is live.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Frontend states                    | Shared `LoadingState`, `EmptyState` and `ErrorState` (with retry) are used on 18 of the 19 page components. The one without is the create-restaurant form, which loads no data. Field-level validation comes from the API's error details. Network, timeout and server errors each have their own message.                                                                                                                                                                                                                                                                                                               |
| Health, readiness, shutdown        | Liveness and readiness endpoints exist. Readiness covers the database with a timeout and returns 503 during shutdown. See M1 for the shutdown order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Backup and restore                 | The procedure is in `operations.md`. A drill with real `pg_dump` (WASM, PostgreSQL 17.5) restored all 10 migrations into an empty database with identical tables, rows, constraints, triggers, indexes, enums, RLS and sequences, and the composite foreign keys still rejected bad references.                                                                                                                                                                                                                                                                                                                          |

## Unresolved risks

1. **H1 deployment step:** confirm the edge proxy, the `TRUST_PROXY_HOPS` value, and that the API and the Next.js apps are not directly reachable.
2. **`multer` 2.5.0:** upgrade after 2026-11-05 (L1).
3. **Plan-limit race:** L4.
4. **One API instance only:** in-memory throttling and order events.
5. **No monitoring service connected:** errors reach logs only, until an `ErrorReporter` for a chosen provider is added.
6. **Backups not yet tested against Supabase:** the restore was drilled on PGlite. Supabase managed backups, point-in-time recovery, storage buckets and restore time at production size are untested.
7. **Not done:**
   - penetration testing;
   - load and soak testing;
   - an accessibility audit beyond component tests;
   - real-device browser testing of the storefront on slow mobile networks;
   - review of the email provider's SPF, DKIM and DMARC.
8. **Data protection:** customer phone numbers and addresses are kept indefinitely. No retention or deletion policy exists yet.

## Commands run

The outputs are in the next section, copied from the actual runs.

| Command                                                                                | Result (2026-11-03, after the fixes)                                                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify` (format, lint, typecheck, unit, API e2e, integration, production builds) | `EXIT 0` · `All matched files use Prettier code style!`                                                                                                  |
| API unit (`vitest --project unit`)                                                     | `Test Files 25 passed (25)` · `Tests 201 passed (201)` (194 before this phase)                                                                           |
| Contracts                                                                              | `Test Files 5 passed (5)` · `Tests 28 passed (28)`                                                                                                       |
| Dashboard unit                                                                         | `Test Files 23 passed (23)` · `Tests 153 passed (153)`                                                                                                   |
| Storefront unit                                                                        | `Test Files 9 passed (9)` · `Tests 81 passed (81)`                                                                                                       |
| API e2e                                                                                | `Test Files 3 passed (3)` · `Tests 12 passed (12)` (9 before)                                                                                            |
| API integration (PGlite, all migrations)                                               | `Test Files 13 passed (13)` · `Tests 204 passed (204)` (199 before; +5 cross-tenant)                                                                     |
| Production builds                                                                      | dashboard and storefront `✓ Compiled successfully`; API `nest build` passed inside `verify`                                                              |
| Storefront Playwright (built with `API_ORIGIN=http://localhost:4100`)                  | `22 passed (1.4m)`                                                                                                                                       |
| Dashboard Playwright (same)                                                            | `16 passed (2.1m)`                                                                                                                                       |
| `pnpm audit --prod`, before                                                            | `5 vulnerabilities found · Severity: 4 moderate \| 1 high`                                                                                               |
| `pnpm audit --prod`, after the nodemailer upgrade                                      | `2 vulnerabilities found · Severity: 1 moderate \| 1 high` (multer L1, minimatch Info)                                                                   |
| Backup/restore drill                                                                   | `"identical": true`, `"foreignKeyAfterRestore": "rejected as expected: … violates foreign key constraint \"orders_organization_id_branch_id…"`, `EXIT 0` |

Notes on the runs:

- The first Playwright run used the builds from `pnpm verify`, whose `/api` rewrite pointed at `localhost:4000`. All 6 checkout tests failed with `ECONNREFUSED`, while the other 16 passed. After rebuilding with the Playwright API origin, everything passed. Next.js fixes rewrite destinations at build time, so build each deployment with its own `API_ORIGIN`.
- Two mutation checks confirm the new tests catch real bugs. Removing the tenant filter from the rider lookup fails `cross-tenant.int-spec.ts` (1 failed, 4 passed). Removing the session-expiry listener fails `session-expiry.test.tsx` (1 failed, 1 passed). Both changes were reverted.
