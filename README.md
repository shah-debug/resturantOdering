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
pnpm dev
```

## Scripts

| Command          | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| `pnpm dev`       | Run the API and both web apps in watch mode       |
| `pnpm lint`      | ESLint across all workspaces                      |
| `pnpm typecheck` | TypeScript checks across all workspaces           |
| `pnpm test`      | Unit and component tests                          |
| `pnpm test:e2e`  | API end-to-end tests                              |
| `pnpm build`     | Production builds (web apps require `API_ORIGIN`) |
| `pnpm verify`    | Everything CI runs, in order                      |

## Environment

All variables are optional in development; the defaults below apply.

| Variable                    | App                   | Notes                                                                             |
| --------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                  | api                   | `development`, `test` or `production`                                             |
| `PORT`                      | api                   | Defaults to `4000`                                                                |
| `TRUST_PROXY_HOPS`          | api                   | Proxies in front of the API (Next.js counts as one). Defaults to `1`              |
| `RATE_LIMIT_WINDOW_SECONDS` | api                   | Rate-limit window per client IP. Defaults to `60`                                 |
| `RATE_LIMIT_MAX_REQUESTS`   | api                   | Requests allowed per window. Defaults to `100`                                    |
| `API_ORIGIN`                | dashboard, storefront | API base URL for the `/api/*` rewrite; required for `next build` and `next start` |
