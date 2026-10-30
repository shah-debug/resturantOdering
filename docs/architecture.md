# Architecture

Pakistan-first, multi-tenant restaurant ordering SaaS. Every restaurant (an **organization**) gets its own branded ordering site; the platform provides one shared dashboard, API and database.

## System overview

```
Customer browser ──► storefront (Next.js, per-restaurant host) ──┐
                                                                 ├─► /api/* rewrite ──► api (NestJS) ──► Supabase Postgres
Staff browser ─────► dashboard (Next.js) ────────────────────────┘                        (Prisma 7 + pg adapter)
```

| Workspace            | Responsibility                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `apps/api`           | NestJS REST API under `/api/v1`. Owns all business rules, authorization and database access. |
| `apps/dashboard`     | Restaurant staff and platform admin UI.                                                      |
| `apps/storefront`    | Customer ordering sites at `/r/<slug>` (see [storefront.md](storefront.md)).                 |
| `packages/contracts` | Zod schemas and types shared by the API and both web apps.                                   |
| `packages/web`       | Shared web code: RTK Query base API, error helpers, theme, CSP proxy, test helpers.          |
| `packages/config-*`  | Shared TypeScript and ESLint configuration.                                                  |

## Request path and security boundaries

- Browsers only talk to the Next.js apps. Each app rewrites `/api/*` to the API, so authentication cookies are first-party and HTTP-only. Tokens are never stored in `localStorage`.
- The API must only be reachable through those proxies (or a trusted load balancer). It derives the client IP from `X-Forwarded-For` according to `TRUST_PROXY_HOPS`, and rate limits per client IP.
- Every page response carries a nonce-based Content Security Policy.
- The API returns one error envelope (`ApiErrorResponse` in `packages/contracts`) for every failure. 5xx responses never expose internal messages.

## Multi-tenancy

Tenant isolation is a security requirement, enforced in layers:

1. **Database (implemented, Phase 1).** Every tenant-owned row carries `organization_id`. References between tenant-owned rows are composite foreign keys on `(organization_id, id)`, so Postgres itself rejects a row that points at another organization's data. See [database-design.md](database-design.md).
2. **API (implemented for staff).** The organization is resolved server-side: an `OrganizationAccessGuard` loads the caller's membership for the `:organizationId` in the URL on every request (non-members get 404); public storefront reads resolve it from a published restaurant slug and never return private fields. It is never taken from client input. Request DTOs reject unknown fields, so a client cannot smuggle in an `organizationId`.
3. **Data access.** Services always filter by the resolved organization; integration tests attempt cross-tenant reads and writes and must fail. Authentication and authorization are described in [auth.md](auth.md).

## Database access

- Supabase provides managed Postgres only. The app does not use Supabase Auth or the Supabase Data API (PostgREST); RLS is enabled with no policies and API roles have no grants, so the Data API cannot read or write application tables.
- Prisma 7 with the `prisma-client` generator (CommonJS output in `apps/api/src/generated/prisma`, not committed) and the `@prisma/adapter-pg` driver adapter.
- `DATABASE_URL` (Supavisor session pooler) is used at runtime with verified TLS (`DATABASE_SSL_CA_PATH`); `DIRECT_URL` is used only by the Prisma CLI for migrations.
- `PrismaService` is a global Nest provider. Connections are opened lazily, the pool is bounded (`DATABASE_POOL_MAX`), idle-client errors are logged instead of crashing the process, and the pool is closed on shutdown (`enableShutdownHooks`).
- `GET /api/v1/health` is liveness (no database). `GET /api/v1/health/ready` runs `SELECT 1` with a timeout and returns `503` when the database is unavailable. The API starts even if the database is down and logs the problem; readiness reports it.

## Migrations and environments

- Migrations are SQL files in `apps/api/prisma/migrations`, generated with `prisma migrate diff` and applied with `prisma migrate deploy`.
- `prisma migrate dev` and `prisma migrate reset` are **not** used against Supabase: they create and drop a shadow database and can prompt to reset data.
- The development seed (`pnpm --filter @app/api db:seed`) refuses to run unless `NODE_ENV=development`, and is never wired into migrate or deploy commands.

## Testing

| Suite                        | Command                 | Needs a database                                                                                          |
| ---------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Unit (API, contracts, web)   | `pnpm test`             | No                                                                                                        |
| API end-to-end (HTTP)        | `pnpm test:e2e`         | No (readiness is tested against an unreachable database)                                                  |
| Integration (API + database) | `pnpm test:integration` | No external database: each test file gets an in-memory PostgreSQL 17 (PGlite) with all migrations applied |

`pnpm verify` runs everything CI runs, including the integration suite. Tests never connect to Supabase.

## Delivery phases

| Phase | Scope                                                                             | State |
| ----- | --------------------------------------------------------------------------------- | ----- |
| 0     | Monorepo, tooling, CI, security headers, CSP, rate limiting                       | Done  |
| 1     | Supabase + Prisma foundation, schema, migrations, seed, readiness                 | Done  |
| 2     | Staff authentication (HTTP-only cookie sessions, CSRF), RBAC, organization access | Done  |
| 3     | Dashboard shell, onboarding, organization and branch settings                     | Done  |
| 4     | Menu management (see [menu.md](menu.md))                                          | Done  |
| 5     | Storefront: public menu and cart (see [storefront.md](storefront.md))             | Done  |
| 6     | Guest checkout and order placement (see [checkout.md](checkout.md))               | Done  |
| 7     | Order operations and live updates                                                 |       |
| 8     | Riders and delivery                                                               |       |
| 9     | Online payments and notifications                                                 |       |
| 10    | Platform admin, billing                                                           |       |
