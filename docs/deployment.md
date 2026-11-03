# Deployment guide

How to deploy the three apps, the database and object storage to staging and production.

> **Status (2026-11-03): nothing in this guide has been carried out yet.** No staging or production environment, domain, DNS record or TLS certificate exists. Every step marked 🔑 needs access to an account (hosting, Supabase, DNS registrar, email provider, GitHub) or an owner's approval. See [Manual steps](#manual-steps-that-need-account-access-or-approval).

## What gets deployed

| Part       | Code                           | Runs as                              | Build                                                                       | Start                                                         |
| ---------- | ------------------------------ | ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| API        | `apps/api` (NestJS 12)         | **one** long-running Node 24 process | `pnpm --filter @app/contracts build && pnpm --filter @app/api build`        | `node dist/main.js`, with `apps/api` as the working directory |
| Dashboard  | `apps/dashboard` (Next.js 16)  | Node 24 process                      | `pnpm --filter @app/contracts build && pnpm --filter @app/dashboard build`  | `pnpm --filter @app/dashboard exec next start --port $PORT`   |
| Storefront | `apps/storefront` (Next.js 16) | Node 24 process                      | `pnpm --filter @app/contracts build && pnpm --filter @app/storefront build` | `pnpm --filter @app/storefront exec next start --port $PORT`  |
| Database   | Supabase Postgres 17           | managed                              | migrations: `pnpm --filter @app/api db:migrate:deploy`                      | —                                                             |
| Files      | Supabase Storage               | managed                              | buckets `menu-images` (public) and `billing-evidence` (private)             | —                                                             |

Before any build, run `pnpm install --frozen-lockfile` at the repository root. The `start` scripts in `package.json` hard-code ports 3000 and 3001. Platforms that assign `PORT` need the `next start --port $PORT` form above.

**Why the API is not serverless:** it runs in-process background workers (notification dispatch every 15 s, billing lifecycle every 15 min), keeps live order streams (SSE) open for up to 15 minutes, and stores rate-limit counters and order events in memory. It needs one always-on instance. A second instance needs a shared store first (see [operations.md](operations.md#run-one-api-instance-for-now)).

**Region:** keep the API and the Next.js servers in the same region as the database. The development project is in `ap-southeast-1` (Singapore), the closest Supabase region to Pakistan. Each server-rendered page and API call crosses that link.

## Network layout

```
customer / staff browser
        │  HTTPS (TLS terminated at the edge)
        ▼
edge proxy / load balancer   ← sets X-Forwarded-For, X-Request-Id; HTTPS redirect; HSTS
        │
        ├── app.<domain>    → dashboard  (Next.js)  ─┐
        └── order.<domain>  → storefront (Next.js)  ─┤  /api/* rewrite (server side)
                                                     ▼
                                     API (private network only, not public)
                                                     │  TLS, CA-verified
                                                     ▼
                                     Supabase Postgres + Storage
```

- **Browsers never call the API directly.** Each Next.js app rewrites `/api/*` to `API_ORIGIN` on the server, so the session cookie is first-party. **CORS stays off** on the API; there is no CORS setting to configure.
- **The API must not be reachable from the internet.** Use the platform's private network (an internal hostname), or a firewall that only admits the two Next.js services.
- **One proxy that appends the visitor's address to `X-Forwarded-For` must sit in front of the Next.js apps.** The Next.js rewrite passes that header through unchanged, so with `TRUST_PROXY_HOPS=1` the API sees the real visitor. Without it, rate limits and audit IPs are wrong or spoofable. This was verified in the production-readiness audit, finding H1.

## Environments

|                  | Development                                                 | Staging                                                                | Production                                                             |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Purpose          | local work                                                  | rehearsal of every release and migration; pilot training               | real restaurants and customers                                         |
| Supabase project | `*-dev`                                                     | **separate** `*-staging` project                                       | **separate** `*-prod` project                                          |
| `NODE_ENV` (API) | `development`                                               | `production`                                                           | `production`                                                           |
| Domains          | `localhost:3000/3001/4000`                                  | `app.staging.<domain>`, `order.staging.<domain>`                       | `app.<domain>`, `order.<domain>`                                       |
| Email            | `MAIL_TRANSPORT=log`                                        | SMTP, sending only to the team's own inboxes                           | SMTP, own sending domain                                               |
| Data             | seed allowed (`db:seed` refuses anything but `development`) | copies of real data **only if anonymised**; otherwise test restaurants | real                                                                   |
| Secrets          | `.env` files, git-ignored                                   | the hosting platform's secret store, staging values                    | the hosting platform's secret store, **different** values from staging |
| Migrations       | `db:migrate:deploy` by hand                                 | GitHub workflow **Database migrations** → `staging`                    | the same workflow → `production`, after staging                        |

Staging runs with `NODE_ENV=production`, so the production safety checks (TLS, HTTPS origins, SMTP, Supabase storage, tracking secret) apply there too. Never point staging at the production database or buckets.

## Environment variables

None of these values belong in git. Set them in the hosting platform's secret or environment settings. 🔑 Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste them straight into the secret store, never into a chat, ticket or log.

### API (`apps/api`)

The API validates its environment on start (`src/config/env.ts`) and refuses to start in production without TLS to the database, a tracking secret, SMTP, Supabase storage and HTTPS origins.

| Variable                                                                                          | Staging and production                                                       | Notes                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                        | `production`                                                                 |                                                                                                          |
| `PORT`                                                                                            | the platform's port, or `4000`                                               |                                                                                                          |
| `TRUST_PROXY_HOPS`                                                                                | `1`                                                                          | proxies **in front of the Next.js apps** that append `X-Forwarded-For`, not counting the Next.js rewrite |
| `DATABASE_URL`                                                                                    | 🔑 Supabase **session pooler** URL, port **5432**, **without** `sslmode`     | used at runtime; see [Database](#database)                                                               |
| `DATABASE_SSL_CA_PATH`                                                                            | path to the Supabase CA file, e.g. `./certs/supabase-ca.crt`                 | **required** in production; mount it as a secret file                                                    |
| `DATABASE_POOL_MAX`                                                                               | `10` (pilot)                                                                 | must leave headroom under the Supabase pool size                                                         |
| `DATABASE_CONNECTION_TIMEOUT_MS` / `DATABASE_STATEMENT_TIMEOUT_MS` / `DATABASE_HEALTH_TIMEOUT_MS` | defaults `5000` / `15000` / `2000`                                           |                                                                                                          |
| `DIRECT_URL`                                                                                      | 🔑 only where migrations run (the GitHub environment), not on the API server | `…:5432/postgres?sslmode=verify-full&sslrootcert=./certs/supabase-ca.crt`                                |
| `APP_ORIGINS`                                                                                     | `https://app.<domain>,https://order.<domain>`                                | exact origins, no path or slash; **both** apps (the storefront posts orders); `https://` only            |
| `DASHBOARD_URL`                                                                                   | `https://app.<domain>`                                                       | base of links in emails                                                                                  |
| `SESSION_TTL_HOURS` / `SESSION_IDLE_TIMEOUT_HOURS`                                                | `168` / `24`                                                                 |                                                                                                          |
| `AUTH_LOCKOUT_THRESHOLD` / `AUTH_LOCKOUT_MINUTES`                                                 | `10` / `15`                                                                  |                                                                                                          |
| `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `STOREFRONT_RATE_LIMIT_MAX_REQUESTS`                         | defaults                                                                     | per visitor IP, so only correct with the edge proxy in place                                             |
| `MAIL_TRANSPORT`                                                                                  | `smtp`                                                                       | `log` is refused in production                                                                           |
| `MAIL_FROM`                                                                                       | `"<Brand> <no-reply@<domain>>"`                                              | an address the SMTP account may send from                                                                |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD`                         | 🔑 from the mail provider                                                    | port 587 with STARTTLS (required in production), or 465 with `SMTP_SECURE=true`                          |
| `ORDER_TRACKING_SECRET`                                                                           | 🔑 64 hex characters, **different per environment**                          | rotating it invalidates every existing tracking link                                                     |
| `STORAGE_DRIVER`                                                                                  | `supabase`                                                                   | `local` is refused in production                                                                         |
| `SUPABASE_URL`                                                                                    | `https://<project-ref>.supabase.co`                                          |                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                       | 🔑 the project's service role key                                            | API server only; never in a Next.js app or the browser                                                   |
| `STORAGE_BUCKET` / `STORAGE_PRIVATE_BUCKET`                                                       | `menu-images` / `billing-evidence`                                           |                                                                                                          |
| `NOTIFICATION_DISPATCH_INTERVAL_SECONDS`                                                          | `15`                                                                         | `0` turns email sending off                                                                              |
| `BILLING_LIFECYCLE_INTERVAL_SECONDS` / `BILLING_EXPIRE_AFTER_DAYS`                                | `900` / `60`                                                                 |                                                                                                          |
| `BILLING_PAYMENT_INSTRUCTIONS`                                                                    | bank / JazzCash / Easypaisa details for owners                               | `\n` for new lines                                                                                       |
| `LOG_FORMAT` / `LOG_REQUESTS`                                                                     | `json` / `true` (production defaults)                                        |                                                                                                          |

These are set automatically and need no configuration:

- **Session cookie:** `__Host-session`, with `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`. The `__Host-` prefix only works over HTTPS and without a `Domain` attribute, so each app keeps its own cookie on its own host.
- **CSRF:** every request that changes data must come from an origin listed in `APP_ORIGINS`.

### Dashboard (`apps/dashboard`)

| Variable     | When                        | Value                                                      |
| ------------ | --------------------------- | ---------------------------------------------------------- |
| `API_ORIGIN` | **build time and run time** | the API's **private** URL, e.g. `http://api.internal:4000` |
| `PORT`       | run time                    | from the platform                                          |

### Storefront (`apps/storefront`)

| Variable                        | When                                  | Value                                                      |
| ------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `API_ORIGIN`                    | **build time and run time**           | same as the dashboard                                      |
| `SITE_URL`                      | run time (**required** in production) | `https://order.<domain>`: canonical links, sitemap, robots |
| `STOREFRONT_REVALIDATE_SECONDS` | run time                              | `30` (menu cache; `0` turns caching off)                   |
| `PORT`                          | run time                              | from the platform                                          |

**`API_ORIGIN` is fixed into the build.** Next.js writes rewrite destinations into `.next` during `next build`. Build each environment separately with its own `API_ORIGIN`, and never promote a staging build to production. The audit showed what happens otherwise: a build made for one API address sent every browser request to the wrong port.

## Database

1. 🔑 Create the Supabase project (`*-staging` or `*-prod`), choose a strong database password and the `ap-southeast-1` region.
2. 🔑 Under **Project Settings → Database → SSL Configuration**, turn on **Enforce SSL** and download the CA certificate.
3. 🔑 Under **Connect**, copy:
   - **Session pooler** (port 5432) → `DATABASE_URL` for the API (no `sslmode`; TLS and the CA come from `DATABASE_SSL_CA_PATH`).
   - **Session pooler** or **direct** → `DIRECT_URL` for migrations, with `?sslmode=verify-full&sslrootcert=./certs/supabase-ca.crt`.
   - Do **not** use the transaction pooler (port 6543). The API sets `statement_timeout` when it connects, and holds interactive transactions and `FOR UPDATE SKIP LOCKED` claims, so it needs session semantics.
4. **Pool size:** under **Database → Connection pooling**, check the pool size. Keep `DATABASE_POOL_MAX` (10 by default) plus migration and admin connections under it. With one API instance and the pilot's traffic, 10 is ample.
5. Leave Supabase Auth and the Data API unused. Row-level security is on for every application table, with no policies and no grants to `anon` or `authenticated`, so the public API keys cannot read anything.
6. **Platform admins:** there is no API to grant platform roles. 🔑 After the first super admin has signed up, run this as a reviewed change in the SQL editor:

   ```sql
   UPDATE users SET platform_role = 'SUPER_ADMIN' WHERE email = '<their email>';
   ```

### Migrations

Migrations are SQL files in `apps/api/prisma/migrations`. They only move forward; Prisma has no "down" migrations.

**Running them** — 🔑 GitHub → **Actions → Database migrations → Run workflow** (`.github/workflows/migrate.yml`):

1. Choose `staging` or `production`, and type the name again to confirm.
2. The workflow:
   - refuses SQL that drops tables or columns, truncates, deletes rows, changes column types or renames objects, unless the migration contains a line `-- approved-destructive: <reason>` (`pnpm --filter @app/api db:migrate:check`, also run in CI through its unit test);
   - prints `prisma migrate status`;
   - runs `prisma migrate deploy`, which applies only pending migrations and never resets anything;
   - checks that nothing is still pending.
3. 🔑 One-time setup:
   - In **Settings → Environments**, create `staging` and `production`, and add **required reviewers** to `production`.
   - Add the secrets `DIRECT_URL` and `SUPABASE_CA_CERT` (the PEM text) to each environment.

**Order for every release:**

1. Take a backup ([operations.md](operations.md#backup-and-restore)).
2. Migrate staging, deploy staging, and smoke-test it.
3. Migrate production.
4. Deploy the production API, then the two Next.js apps.

Migrations must be **backward compatible** with the API version that is still running. Add before you remove (expand, then contract): new columns are nullable or have defaults, and a column is dropped one release after the code stops using it.

**Never** run `prisma migrate dev`, `migrate reset` or `db push`, `db:seed`, or hand-written `DROP`/`TRUNCATE`/`DELETE` against staging or production.

**Pending at the time of writing.** These may not be applied even to the development project. Check with `db:migrate:status`:

- `20261101090000_subscription_suspended`
- `20261101090100_billing`
- `20261103090000_audit_log_recent_index`

### Rollback and recovery

| Situation                                                | What to do                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New API or app release misbehaves, schema unchanged      | Redeploy the previous build. Keep the last 3 builds or images per app.                                                                                                                                                                                                                                                   |
| Release misbehaves after a backward-compatible migration | Redeploy the previous build. The old code still works with the new schema, so leave the migration in place and fix forward.                                                                                                                                                                                              |
| Migration fails half-way                                 | `prisma migrate status` shows it as failed. PostgreSQL runs DDL in a transaction, so most failures leave nothing applied. Read the error, fix the SQL in a **new** migration, mark the failed one with `prisma migrate resolve --rolled-back <name>` (🔑 approval), then deploy again. Do not edit an applied migration. |
| Data was damaged (bad backfill, mistaken delete)         | Stop writes: scale the API to 0, or turn ordering off for affected restaurants. Restore into a **scratch** project, compare, then copy the affected rows back with a reviewed script, or (🔑 owner approval) restore production from the backup or point-in-time.                                                        |
| Lost Storage objects                                     | Restore from the bucket copy. Database backups do not include Storage.                                                                                                                                                                                                                                                   |

### Backups

- 🔑 **Automatic:** use a Supabase plan that includes **daily backups**, and turn on **point-in-time recovery** for production if the budget allows. Check under **Database → Backups** that backups are listed and what the retention is. At the time of writing these are paid-plan features; confirm on Supabase's pricing page.
- 🔑 **Logical backup** before each production migration and weekly: `pg_dump` over the session pooler, with the result encrypted and kept outside Supabase. The commands are in [operations.md](operations.md#backup-and-restore).
- 🔑 **Storage:** copy both buckets weekly. The receipts bucket stays private and encrypted.
- **Restore test:** the procedure was drilled on PGlite on 2026-11-03; everything matched (see [operations.md](operations.md#restore-drill-2026-11-03)). 🔑 Before launch, run the same procedure against a scratch Supabase project, using a real Supabase backup, and record the time it takes.

## Object storage

1. 🔑 Create the bucket `menu-images`:
   - **public**;
   - 5 MB file limit;
   - types `image/jpeg, image/png, image/webp`.

   Menu photos are public by design. Uploads only go through the API, using the service key.

2. 🔑 Create the bucket `billing-evidence`:
   - **private**;
   - 5 MB file limit;
   - types `image/jpeg, image/png, image/webp, application/pdf`.

   Receipts are only served through authorized API endpoints. Never make this bucket public or create a policy for it.

3. Both web apps allow `https:` images in their Content Security Policy, so Supabase image URLs load without changes.

## Domains, DNS and TLS

🔑 Choose a brand domain, for example a `.pk` from a PKNIC registrar, or a `.com`, and pick hosts like these:

| Host                                             | Points to                                                                  | Purpose                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `app.<domain>`                                   | dashboard service, through the edge                                        | staff and platform admin                                |
| `order.<domain>`                                 | storefront service, through the edge                                       | customers: `https://order.<domain>/r/<restaurant-slug>` |
| `app.staging.<domain>`, `order.staging.<domain>` | staging services                                                           |                                                         |
| `<domain>` / `www`                               | marketing page, or a redirect to `order.<domain>`                          | optional                                                |
| API                                              | **no public DNS record** (internal hostname only)                          |                                                         |
| Mail                                             | SPF, DKIM and DMARC records for the sending domain, from the SMTP provider | so emails are not marked as spam                        |

1. 🔑 At the DNS host, add `CNAME`, or `A`/`AAAA`, records to the hosting provider's targets. Use a short TTL (300 s) during launch.
2. 🔑 Issue certificates for each host on the hosting platform or edge (Let's Encrypt or managed). Turn on **HTTP → HTTPS redirect** and **HSTS** at the edge once HTTPS works. Start with `max-age=86400`, then raise it to a year. The `__Host-` session cookie needs HTTPS.
3. Set `APP_ORIGINS`, `DASHBOARD_URL` and `SITE_URL` to the final `https://` origins **before** the first production start.
4. **Verify after DNS and TLS are live:**
   - `curl -sI https://app.<domain>/healthz` and `https://order.<domain>/healthz` → `200`;
   - signing in sets a `__Host-session` cookie marked `Secure; HttpOnly; SameSite=Lax`;
   - `https://order.<domain>/r/<slug>` shows the menu;
   - the API URL is **not** reachable from outside.

### Slug-based storefront routing (today)

Each restaurant's storefront is `https://order.<domain>/r/<slug>`. The slug is chosen at sign-up, unique and lower-case, and mixed-case addresses redirect to the canonical one. Tracking links are `/r/<slug>/orders/<id>?token=…`. `sitemap.xml` and `robots.txt` use `SITE_URL`. The dashboard does not show the storefront link yet, so during the pilot, give each restaurant its link by hand.

### Custom domains (future, not built)

The table `organization_domains` (hostname, primary flag, verification token, verified time) already exists. No code uses it. Rollout plan:

1. **Dashboard:** the owner adds `order.theirrestaurant.pk`. The API stores it with a random verification token.
2. **Ownership:** the owner adds a `TXT _rop-verify.<host>` record with the token, plus a `CNAME` to `custom.<domain>`. A worker checks DNS and sets `verified_at`.
3. **TLS:** use on-demand certificates for verified hosts only, for example Cloudflare for SaaS custom hostnames, Caddy on-demand TLS with an `ask` endpoint backed by `organization_domains`, or the hosting platform's domains API.
4. **Routing:** the storefront's `proxy.ts` resolves `Host` → slug (cached), then rewrites `/` → `/r/<slug>`. Unverified hosts get the not-found page.
5. **Security changes** that must ship at the same time:
   - CSRF origins become `APP_ORIGINS` plus the verified hosts from the database, instead of a static list;
   - canonical URLs and the sitemap use the primary domain;
   - customers' tracking links use the domain they ordered on.
6. **Pilot first** with one restaurant, keeping `/r/<slug>` working as a fallback.

## Health checks

| Check                                      | URL                                           | Expect                                                             |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------ |
| API liveness                               | `GET /api/v1/health`                          | `200`                                                              |
| API readiness (load balancer, deploy gate) | `GET /api/v1/health/ready`                    | `200`; `503` while the database is unreachable or during shutdown  |
| Dashboard                                  | `GET /healthz`                                | `200` `{"status":"ok"}` (no API call, never redirected to sign-in) |
| Storefront                                 | `GET /healthz`                                | `200`                                                              |
| End to end, from outside                   | `GET https://order.<domain>/r/<a pilot slug>` | `200` with the menu                                                |

Set the shutdown grace period to **at least 30 s** so in-flight requests and worker batches finish ([operations.md](operations.md#graceful-shutdown)).

## Logging and error monitoring

- API logs are JSON lines on stdout, with an `X-Request-Id` on every response and no query strings. Ship stdout to the platform's log service, and keep logs 30 days or more.
- 🔑 **Error monitoring:** no service is connected. Pick one (for example Sentry or the platform's own), then implement `ErrorReporter` for it in `src/common/observability/`. It receives HTTP 5xx, worker failures and process-level errors. Until then, set up a log alert on `"level":"error"`.
- 🔑 **Uptime alerts:** an external monitor on `/api/v1/health/ready`, reached through an internal check or a protected status route, and on both `/healthz` URLs every minute, alerting by SMS or WhatsApp to the on-call person.
- **The super admin's Platform → Health page** shows notification backlog and failures, stuck orders and live connections. Check it daily ([pilot-launch.md](pilot-launch.md#daily-monitoring)).

## Release checklist

1. CI is green on `main` (`pnpm verify`).
2. Backup taken, and the migration guard and migrations ran on staging.
3. Staging smoke test: sign in, edit the menu, place and track a test order, accept → deliver, check the report.
4. Production migration (approved), then deploy the API and wait for `/health/ready` to return `200`, then deploy the dashboard and storefront.
5. Production smoke test with the platform's own test restaurant (unpublished or suspended afterwards).
6. Watch the logs and Platform → Health for 30 minutes.

## Manual steps that need account access or approval

None of these have been done. Each needs someone with the account or the authority:

1. Choose a hosting provider for 3 Node services with private networking, an edge proxy that sets `X-Forwarded-For`, secret files and a ≥30 s shutdown grace.
2. Create the Supabase **staging** and **production** projects, choose the plan (backups and PITR), enforce SSL, download the CA, and create both buckets.
3. Buy or choose the domain; set up DNS records, TLS certificates, the HTTPS redirect and HSTS.
4. Set up the email provider: SMTP credentials, plus SPF, DKIM and DMARC on the sending domain.
5. Generate and store the production secrets: `ORDER_TRACKING_SECRET`, the database password, the service role key and the SMTP password.
6. Create the GitHub environments, required reviewers and migration secrets.
7. Approve the first production migration run.
8. Grant the first `SUPER_ADMIN` with SQL.
9. Choose an error-monitoring service and set up uptime alerts.
10. Run the restore test against a scratch Supabase project.
11. Confirm the edge proxy's `X-Forwarded-For` behaviour (audit finding H1) and that the API is not reachable from outside.
12. Upgrade `multer` once 2.5.0 has been out for two weeks (after 2026-11-05).
