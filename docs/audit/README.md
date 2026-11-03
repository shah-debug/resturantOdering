# Audit checklist

This is the module-by-module audit that follows the cross-cutting [production-readiness audit](../production-readiness-audit.md) of 2026-11-03.

That earlier audit covered these concerns across the whole codebase:

- the guard on every route;
- tenant isolation (`cross-tenant.int-spec.ts`);
- SQL safety, XSS and CSP;
- uploads;
- secrets;
- shutdown, logging and timeouts;
- session expiry in the dashboard;
- dependencies;
- backup and restore.

It did **not** read each module's business logic line by line. This checklist does.

A module is marked **Done** only after its code has been read and each important finding is either fixed with a regression test, or recorded as **Open** with the reason. The finding details are in [findings.md](findings.md), and the results in [final-audit-report.md](final-audit-report.md).

## Status

Every module below has been read. Finding IDs refer to [findings.md](findings.md).

| Area       | Module                                                 | Status | What was checked                                                                                                                                      | Findings                          |
| ---------- | ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| API        | auth                                                   | Done   | login, lockout, timing on unknown email, token hashing, expiry and single use, password reset and change, invitations, DTO bounds                     | AUD-01 fixed; AUD-02, AUD-03 open |
| API        | access (guards, permissions)                           | Done   | 88 routes listed with guards (earlier audit); role and platform permission tables                                                                     | —                                 |
| API        | organizations and memberships                          | Done   | role assignment rules, last-owner lock, branch scope, DTOs, reserved slugs                                                                            | AUD-04 fixed; AUD-05, AUD-15 open |
| API        | branches and onboarding                                | Done   | branch scope on writes, opening hours, fulfillment, default zone                                                                                      | AUD-09 fixed                      |
| API        | menu (categories, products, variants, add-ons, images) | Done   | foreign variant and add-on IDs refused, reference checks, SKU uniqueness, reorder validation, image replace and cleanup                               | none new (L4 carried)             |
| API        | orders: checkout and placement                         | Done   | server-side pricing from locked rows, `PRICE_CHANGED` check, idempotency fingerprint, atomic promotion use, subscription check inside the transaction | AUD-06, AUD-07, AUD-16 open       |
| API        | orders: operations, riders, events                     | Done   | per-transition permissions, `expectedStatus` concurrency, rider rules, branch scope, data shown to each role                                          | AUD-08 fixed                      |
| API        | riders                                                 | Done   | branch scope on list, create, move and reactivate; phone uniqueness                                                                                   | —                                 |
| API        | reports                                                | Done   | 92-day limit, branch scope, CSV injection guard, export cap and cost                                                                                  | AUD-10 fixed                      |
| API        | platform                                               | Done   | role split, CSV export, bounded pages, parameterised search                                                                                           | —                                 |
| API        | billing                                                | Done   | four-eyes rule, double review, sums under concurrency, evidence privacy, lifecycle                                                                    | AUD-11 fixed; AUD-17 accepted     |
| API        | storefront (public)                                    | Done   | only active, onboarded restaurants; cache headers; tracking works for suspended restaurants                                                           | —                                 |
| API        | storage and media                                      | Done   | key pattern, private bucket, content sniffing (earlier audit)                                                                                         | —                                 |
| API        | notifications and mail                                 | Done   | plain-text email only; CR/LF in subjects folded by nodemailer (verified); outbox deduplication                                                        | —                                 |
| API        | audit, health, observability, config, database         | Done   | earlier audit (shutdown, logging, env checks, indexes, backup drill)                                                                                  | —                                 |
| Dashboard  | API usage and polling (all features)                   | Done   | no direct `fetch`; searches debounced (300 ms); polling only while live updates are offline; per-page queries                                         | AUD-12 fixed                      |
| Dashboard  | auth UI and session                                    | Done   | open-redirect guard; session-expiry redirect (earlier audit)                                                                                          | AUD-14 verified                   |
| Dashboard  | orders UI                                              | Done   | masked phone shown without a broken `tel:` link                                                                                                       | part of AUD-08                    |
| Storefront | tracking page                                          | Done   | refresh only while visible                                                                                                                            | AUD-13 fixed                      |
| Storefront | cart and checkout                                      | Done   | cart storage keeps only IDs and quantities, validated on restore; idempotency key reused while the cart is unchanged                                  | —                                 |
| Shared     | packages/contracts and packages/web                    | Done   | schemas are bounds-checked; CSP, timeouts, error messages (earlier audit)                                                                             | —                                 |
