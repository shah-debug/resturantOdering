# Final audit report

**Date:** 2026-11-03
**Scope:** every module of the API, dashboard, storefront and shared packages ([checklist](README.md)).
**Builds on:** the cross-cutting [production-readiness audit](../production-readiness-audit.md).

> This is an engineering code review backed by automated tests. It is **not** a security certification, a penetration test or a load test. "No findings" means nothing was found when reading that module, not that the module is proven secure.

## Outcome

|                                                 | Count                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Modules audited                                 | 21 of 21 ([checklist](README.md))                                                                    |
| Findings                                        | 17 ([register](findings.md))                                                                         |
| Fixed, with regression tests                    | 16: AUD-01 to AUD-13 and AUD-15 to AUD-17 (AUD-17 mitigated, because the uniqueness check must stay) |
| Verified correct, tests added                   | 1: AUD-14                                                                                            |
| Still needing an outside decision               | the SMS one-time-password step in AUD-06 (needs a confirmed SMS provider)                            |
| Carried over from the earlier audit, still open | 5: H1, L1, L4, L5, single instance (outside AUD-01 to AUD-17)                                        |

### Fixes in the second pass (2026-11-03)

For every fix marked "failed without the fix", the regression test was first run on the code before the change and failed, then passed after it.

| ID     | Fix                                                                                                                             | Test evidence                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| AUD-02 | A locked account answers exactly like an unknown email (`401`, same hashing work); the owner is emailed when the lock starts    | response fields compared with the unknown-email case; email checked    |
| AUD-03 | One reset or verification email per account every 2 minutes                                                                     | failed without the fix (`expected 5 to be 1`)                          |
| AUD-05 | One free trial per owner; later restaurants are billed from the next local midnight                                             | failed without the fix (a new 14-day trial)                            |
| AUD-06 | Block or unblock a number from the order page (reason and audit kept; checkout refuses it); "first order, call to confirm" flag | integration, cross-tenant and 3 component tests                        |
| AUD-07 | Checkout no longer renames an existing customer                                                                                 | failed without the fix (`expected 'Someone Else' to be 'Ayesha Khan'`) |
| AUD-15 | Branch-limited roles lose organization-wide settings (profile, menu, billing)                                                   | failed without the fix (`expected 403, got 200`)                       |
| AUD-16 | One generic message for unusable promotion codes, plus a promotion-code rate limit                                              | checkout and e2e rate-limit tests                                      |
| AUD-17 | Payment submission is rate limited; duplicate references are audited, including those from other restaurants                    | audit entry asserted                                                   |

### Still open

1. **AUD-06, SMS verification:** choose an SMS provider and set up the account, then add a one-time-password step for first orders from new numbers.
2. **H1, deployment:** an edge proxy that sets `X-Forwarded-For` ([deployment.md](../deployment.md)).
3. **L1:** upgrade `multer` to 2.5.0 after 2026-11-05.
4. **L4:** concurrent creates can go over a plan limit.
5. **One API instance only:** in-memory rate limits and live events.
6. **AUD-15, dashboard:** the dashboard still shows organization-wide edit buttons to branch-limited managers. The API refuses those actions.
7. **Accepted:** L5, tracking links do not expire.

## API and polling optimizations made

- **Live order events:** one refetch per burst instead of one per event (AUD-12).
- **Tracking page:** no requests from hidden tabs (AUD-13).
- **Timezone and CSV code:** about 2 s less blocked event loop per maximum export (AUD-10).
- **First-order count:** computed in the same order query, so there is no N+1 (AUD-06).

These were checked and found already efficient:

- debounced searches;
- polling only while the stream is offline;
- no direct `fetch` in components;
- a fixed set of cached queries per page.

## Final verification (2026-11-03, after all 17 findings)

| Command                                                               | Actual result                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm verify`                                                         | **`EXIT 0`**                                                         |
| ├ format                                                              | `All matched files use Prettier code style!`                         |
| ├ API unit                                                            | `Test Files 26 passed (26)` · `Tests 226 passed (226)`               |
| ├ contracts                                                           | `Test Files 5 passed (5)` · `Tests 28 passed (28)`                   |
| ├ dashboard unit                                                      | `Test Files 27 passed (27)` · `Tests 175 passed (175)`               |
| ├ storefront unit                                                     | `Test Files 10 passed (10)` · `Tests 84 passed (84)`                 |
| ├ API e2e                                                             | `Test Files 3 passed (3)` · `Tests 13 passed (13)`                   |
| ├ API integration (PGlite, all migrations)                            | `Test Files 13 passed (13)` · `Tests 211 passed (211)`               |
| └ production builds                                                   | both Next.js apps `✓ Compiled successfully`; API `nest build` passed |
| Storefront Playwright (built with `API_ORIGIN=http://localhost:4100`) | `22 passed (59.2s)`                                                  |
| Dashboard Playwright (same)                                           | `16 passed (1.5m)`                                                   |
| `pnpm audit --prod`                                                   | `2 vulnerabilities found · Severity: 1 moderate                      | 1 high` (multer L1, minimatch dev tooling) |
| `pnpm --filter @app/api db:migrate:check`                             | `Migration guard: no unapproved destructive statements.`             |

There are no new database migrations: `customers.blocked_at` already existed, and block reasons are stored in the audit log.

**New environment variable:** `PROMO_RATE_LIMIT_MAX_REQUESTS` (default 20). It is documented in `.env.example` and [deployment.md](../deployment.md).
