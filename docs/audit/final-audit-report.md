# Final audit report

**Date:** 2026-11-03
**Scope:** every module of the API, dashboard, storefront and shared packages ([checklist](README.md)).
**Builds on:** the cross-cutting [production-readiness audit](../production-readiness-audit.md).

> This is an engineering code review backed by automated tests. It is **not** a security certification, a penetration test or a load test. "No findings" means nothing was found when reading that module, not that the module is proven secure.

## Outcome

|                                                 | Count                                 |
| ----------------------------------------------- | ------------------------------------- |
| Modules audited                                 | 21 of 21 ([checklist](README.md))     |
| New findings                                    | 17 ([register](findings.md))          |
| Fixed, with regression tests                    | 8: AUD-01, 04, 08, 09, 10, 11, 12, 13 |
| Verified correct, tests added                   | 1: AUD-14                             |
| Open or accepted, with reasons                  | 8: AUD-02, 03, 05, 06, 07, 15, 16, 17 |
| Carried over from the earlier audit, still open | 5: H1, L1, L4, L5, single instance    |

### Fixed, by severity

| ID     | Severity             | Fix                                                                             | How the test proves it                                                                                                  |
| ------ | -------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| AUD-01 | High                 | Lockout uses an atomic counter                                                  | failed without the fix (`expected 423, got 200`)                                                                        |
| AUD-04 | Medium               | Member management stays inside a branch manager's branch                        | failed without the fix (`expected 403, got 201`)                                                                        |
| AUD-09 | Medium               | Branch writes and creation stay inside a branch manager's branch                | failed without the fix (`expected 403, got 201`)                                                                        |
| AUD-10 | Medium (performance) | Cached `Intl.DateTimeFormat`; 20k conversions went from 2,139 ms to about 40 ms | failed without the fix (`expected 2138.7 to be less than 1000`)                                                         |
| AUD-11 | Medium               | Invoice row locked before summing verified payments                             | sequential path tested; the concurrent case was checked by reading the code only (the test database has one connection) |
| AUD-08 | Low (privacy)        | Masked phone and no address for roles without `orders:manage`                   | kitchen view asserted masked                                                                                            |
| AUD-12 | Low (performance)    | Live-order invalidations batched over 400 ms                                    | 3 unit tests                                                                                                            |
| AUD-13 | Low (performance)    | Tracking page refreshes only while visible                                      | component test with fake timers                                                                                         |

### Open, ranked

1. **H1, deployment:** put an edge proxy that sets `X-Forwarded-For` in front of the Next.js apps. See [deployment.md](../deployment.md).
2. **AUD-06:** cash orders have no phone verification, and there is no way to block a customer. This is a business-abuse risk for the pilot.
3. **L1:** upgrade `multer` to 2.5.0 after 2026-11-05.
4. **L4:** concurrent creates can go over a plan limit.
5. **One API instance only:** in-memory rate limits and live events.
6. **AUD-15:** branch managers can edit the organization profile and the menu. This is a product decision.
7. **AUD-16:** promotion codes can be probed. Fix this before promotions ship.
8. **AUD-03:** a per-account cooldown on reset and verification emails.
9. **AUD-05:** unlimited trials per user.
10. **AUD-07:** a new order overwrites the stored customer name.
11. **Accepted:** AUD-02 (lockout shows that an account exists), AUD-17 (reference uniqueness), L5 (tracking links do not expire).

## API and polling optimizations made

- **Live order events:** a burst of events, or an echo of a staff member's own change, now causes one refetch instead of one per event on every dashboard (AUD-12).
- **Tracking page:** no requests from hidden tabs (AUD-13).
- **Report CSV and timezone helpers:** no longer block the event loop for about 2 s per maximum export (AUD-10).

These were checked and found already efficient:

- all searches are debounced (300 ms);
- polling runs only while the live stream is offline;
- there are no direct `fetch` calls in components;
- each page uses a small fixed set of cached queries.

## Final verification (2026-11-03, after all fixes)

| Command                                                               | Actual result                                                                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                         | first run `EXIT 1`, because `prettier --check` flagged `docs/audit/README.md` after a table edit; formatted and re-run → **`EXIT 0`** |
| ├ format                                                              | `All matched files use Prettier code style!`                                                                                          |
| ├ API unit                                                            | `Test Files 26 passed (26)` · `Tests 225 passed (225)`                                                                                |
| ├ contracts                                                           | `Test Files 5 passed (5)` · `Tests 28 passed (28)`                                                                                    |
| ├ dashboard unit                                                      | `Test Files 26 passed (26)` · `Tests 172 passed (172)`                                                                                |
| ├ storefront unit                                                     | `Test Files 10 passed (10)` · `Tests 84 passed (84)`                                                                                  |
| ├ API e2e                                                             | `Test Files 3 passed (3)` · `Tests 12 passed (12)`                                                                                    |
| ├ API integration (PGlite, all migrations)                            | `Test Files 13 passed (13)` · `Tests 207 passed (207)`                                                                                |
| └ production builds                                                   | both Next.js apps `✓ Compiled successfully`; API `nest build` passed                                                                  |
| Storefront Playwright (built with `API_ORIGIN=http://localhost:4100`) | `22 passed (59.1s)`                                                                                                                   |
| Dashboard Playwright (same)                                           | `16 passed (1.5m)`                                                                                                                    |
| `pnpm audit --prod`                                                   | `2 vulnerabilities found · Severity: 1 moderate \| 1 high` (multer L1, minimatch dev tooling; unchanged)                              |
| `pnpm --filter @app/api db:migrate:check`                             | `Migration guard: no unapproved destructive statements.`                                                                              |

There are no new database migrations in this audit.
