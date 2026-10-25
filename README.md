# Restaurant Ordering Platform

Multi-tenant restaurant ordering SaaS for Pakistan. Each restaurant gets a branded ordering site; the platform provides a shared dashboard and API.

## Workspace

| Path                         | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `apps/api`                   | NestJS REST API, served under `/api/v1` (port 4000)                    |
| `apps/dashboard`             | Next.js dashboard for restaurant staff and platform admins (port 3000) |
| `apps/storefront`            | Next.js customer-facing ordering sites (port 3001)                     |
| `packages/contracts`         | Shared Zod schemas and types for API requests, responses and errors    |
| `packages/web`               | Shared web code: RTK Query base API, error helpers, theme, CSP, tests  |
| `packages/config-typescript` | Shared strict TypeScript configs                                       |
| `packages/config-eslint`     | Shared ESLint flat config                                              |

Both Next.js apps proxy `/api/*` to the API through same-origin rewrites, so authentication cookies stay first-party and HTTP-only. The API must only be reachable through those proxies (or a load balancer you trust): it reads the client IP from `X-Forwarded-For` according to `TRUST_PROXY_HOPS`.

Pages are rendered dynamically with a per-request nonce-based Content Security Policy, set in each app's `src/proxy.ts`.

## Requirements

- Node.js 24 (see `.nvmrc`)
- pnpm 12, via Corepack: `corepack enable pnpm`

## Setup

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/storefront/.env.example apps/storefront/.env.local
# fill in DATABASE_URL and DIRECT_URL in apps/api/.env (Supabase development project)
pnpm codegen
pnpm --filter @app/api db:migrate:deploy
pnpm --filter @app/api db:seed   # optional, development only
pnpm dev
```

## Scripts

| Command          | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `pnpm dev`       | Run the API and both web apps in watch mode                             |
| `pnpm lint`      | ESLint across all workspaces                                            |
| `pnpm typecheck` | TypeScript checks across all workspaces                                 |
| `pnpm test`      | Unit and component tests                                                |
| `pnpm test:e2e`  | API end-to-end tests                                                    |
| `pnpm test:db`   | Database integrity tests (development database, every test rolled back) |
| `pnpm codegen`   | Build shared contracts and generate the Prisma client                   |
| `pnpm build`     | Production builds (web apps require `API_ORIGIN`)                       |
| `pnpm verify`    | Everything CI runs, in order                                            |

## Environment

Only `DATABASE_URL` is required (and `DIRECT_URL` for migrations); other values have the defaults below. See [docs/architecture.md](docs/architecture.md) and [docs/database-design.md](docs/database-design.md).

| Variable                         | App                   | Notes                                                                             |
| -------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                       | api                   | `development`, `test` or `production`                                             |
| `PORT`                           | api                   | Defaults to `4000`                                                                |
| `TRUST_PROXY_HOPS`               | api                   | Proxies in front of the API (Next.js counts as one). Defaults to `1`              |
| `RATE_LIMIT_WINDOW_SECONDS`      | api                   | Rate-limit window per client IP. Defaults to `60`                                 |
| `RATE_LIMIT_MAX_REQUESTS`        | api                   | Requests allowed per window. Defaults to `100`                                    |
| `DATABASE_URL`                   | api                   | Supabase pooler URL used at runtime. Required                                     |
| `DIRECT_URL`                     | api (Prisma CLI)      | Direct or session-pooler URL used for migrations                                  |
| `DATABASE_POOL_MAX`              | api                   | Maximum pooled connections. Defaults to `10`                                      |
| `DATABASE_CONNECTION_TIMEOUT_MS` | api                   | Defaults to `5000`                                                                |
| `DATABASE_HEALTH_TIMEOUT_MS`     | api                   | Readiness query timeout. Defaults to `2000`                                       |
| `API_ORIGIN`                     | dashboard, storefront | API base URL for the `/api/*` rewrite; required for `next build` and `next start` |
