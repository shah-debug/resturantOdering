# Operations

How to run the API in production: health checks, logs, error monitoring, shutdown, client IP addresses, migrations, and backup and restore.

## Health and readiness

| Endpoint                      | Use                         | Behaviour                                                                                                                  |
| ----------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health`          | Liveness probe              | Always 200 while the process runs. Does not touch the database.                                                            |
| `GET /api/v1/health/ready`    | Readiness / load balancer   | 200 when the database answers within `DATABASE_HEALTH_TIMEOUT_MS`; 503 otherwise, and 503 from the moment shutdown starts. |
| `GET /api/v1/platform/health` | Platform admin (both roles) | Database latency, notification queue (pending, failed in 24 h, oldest), stuck orders, live SSE connections.                |

Both public endpoints skip rate limiting. Neither returns version numbers, hostnames or error details.

## Logs

- Production writes one JSON object per line (`LOG_FORMAT=json` is the default there). Development uses readable output.
- Every response carries an `X-Request-Id`. A well-formed id sent by the load balancer (8–128 characters of `A–Z a–z 0–9 . _ -`) is kept. Anything else is replaced with a new UUID, so a header cannot be injected into the logs.
- With `LOG_REQUESTS` (on by default outside tests), each request logs one line: request id, method, **path without the query string**, status and duration. Query strings are never logged, because they can carry tokens. Successful health probes are not logged.
- 5xx errors are reported with their request id, so a customer's "something went wrong" can be matched to a stack trace. Clients only ever see the generic error envelope.
- The `log` mail transport prints email bodies, including sign-in links. The API refuses to start with it in production.

## Error monitoring

All unexpected errors go through one hook, `ErrorReporter` (`apps/api/src/common/observability/error-reporter.ts`). That covers:

- HTTP 5xx responses;
- background worker failures (notification dispatch and the billing lifecycle);
- `unhandledRejection` and `uncaughtException`.

The default implementation writes a structured error log. To send errors to a monitoring service, provide another class for `ErrorReporter` in `ObservabilityModule`. No service is wired in, because none has been chosen.

When you add one:

- Do not send request bodies, cookies or headers.
- Report the context fields only: source, request id, method, path and task.

## Graceful shutdown

On `SIGTERM` or `SIGINT` the API shuts down in this order:

1. Readiness switches to 503, so the load balancer stops sending new traffic.
2. Background workers stop their timers and **wait for the batch in progress** to finish. Both workers are safe to resume after an interruption: claims expire and steps are conditional.
3. Live order streams (SSE) are closed. The dashboard reconnects with back-off and falls back to polling meanwhile.
4. The HTTP server stops accepting connections and lets in-flight requests finish.
5. The database pool is closed **last**, so in-flight requests keep working.

Give the process at least 30 seconds between `SIGTERM` and `SIGKILL`.

An `uncaughtException` is reported, followed by the same orderly shutdown, and the process then exits with code 1. If the API fails to start, it logs the reason and exits with code 1.

## Client IP addresses

Rate limits, login lockouts and audit logs use the client IP. The API reads it from `X-Forwarded-For`, counting `TRUST_PROXY_HOPS` hops from the right.

The Next.js rewrite (`/api/*` → API) forwards `X-Forwarded-For` **unchanged and does not append the visitor's address**. This was verified against the proxy Next.js bundles. As a result:

- **Without an edge proxy, the Next.js apps must not be exposed directly.** Every visitor would then appear as the Next.js server's address and share one rate-limit bucket. A visitor who sends their own `X-Forwarded-For` would also choose the IP the API sees.
- **Put exactly one proxy that appends the real address in front of the apps.** Examples are a load balancer, Nginx (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`), Cloudflare or a managed platform. Set `TRUST_PROXY_HOPS` to the number of such appending proxies, which is usually `1`. Spoofed values then sit to the left of the real address and are ignored.
- **The order-tracking page forwards the incoming `X-Forwarded-For` on its server-side fetch.** It is rendered on the server, and the forwarding makes it follow the same rule as browser requests. The value is checked against a strict IP-list pattern before it is forwarded.
- **The API must not be reachable from the internet except through the apps.**

### Run one API instance for now

- **Rate limits:** counters are kept in memory **per API instance**. With several instances behind a load balancer, the effective limit is multiplied by the number of instances.
- **Live order updates:** they are published in process (`OrderEventsService`). A dashboard connected to instance B never hears about an order placed through instance A, and it only falls back to polling when its stream is offline.

Before adding a second instance, move both to shared infrastructure: a Redis throttler store, and Postgres `LISTEN/NOTIFY` or Redis pub/sub for events.

## Migrations

Staging and production migrations run through the approval-gated GitHub workflow **Database migrations**, which also refuses unapproved destructive SQL (`db:migrate:check`); see [deployment.md](deployment.md#migrations). Under the hood it runs `pnpm --filter @app/api db:migrate:deploy`. It only applies pending migrations; it never resets or drops anything.

1. Take a backup, as below.
2. Apply the migrations to a non-production copy first.
3. Run `db:migrate:status`.
4. Deploy the API.

Never run `prisma migrate dev` or `migrate reset` against Supabase.

## Backup and restore

### What Supabase does

Supabase takes daily backups of the database. Point-in-time recovery is a paid add-on. Check the retention for your plan under **Project → Database → Backups**. Storage buckets are **not** included in database backups:

- menu images in `menu-images`;
- payment receipts in `billing-evidence`.

### Manual logical backup

Before every migration, and at least weekly, take a logical backup:

1. Use the **direct connection** or the **session pooler (port 5432)**. The transaction pooler on port 6543 does not support `pg_dump`.

   ```sh
   pg_dump "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
     --schema=public --no-owner --no-privileges --format=custom \
     --file="backup-$(date +%Y%m%d-%H%M).dump"
   ```

2. Copy the storage buckets with the Supabase CLI or the Storage API. The private bucket holds payment receipts: keep its copy private and encrypted.
3. Store backups encrypted, outside the Supabase project, and with access limited to the people who run restores. They contain customer names, phone numbers and addresses.

### Restore into a non-production copy

Never restore into production first.

1. Create a **separate** Supabase project, or a local PostgreSQL 17 instance. Supabase's own schemas (`auth`, `storage`) are already present in a new project.
2. Restore the backup:

   ```sh
   pg_restore --no-owner --no-privileges --dbname="<scratch database url>" backup-YYYYMMDD-HHMM.dump
   ```

3. Check the restore:
   - `pnpm --filter @app/api db:migrate:status`, with `DATABASE_URL` pointing at the copy, reports no pending or failed migrations.
   - Row counts for `organizations`, `orders`, `subscription_invoices` and `audit_logs` match the source.
   - Start the API against the copy. `GET /api/v1/health/ready` returns 200, and signing in and opening a restaurant's orders work.
4. Only after the checks pass, and with written approval, restore into production. Stop the API first, so that no writes land between the backup and the restore.

### Restore drill (2026-11-03)

The drill was run without any production or Supabase data. There was no PostgreSQL client or Docker on the machine, so it used PGlite (PostgreSQL 17.5) and the WebAssembly build of the real `pg_dump` from `@electric-sql/pglite-tools` 0.3.3, installed outside the repository.

1. All 10 migrations were applied to an empty database, and a restaurant, branch, customer, menu item and order were added. The order was inserted inside a transaction, because of the deferred consistency trigger.
2. The database was dumped with `--no-owner --no-privileges` (115 KB in under 1 s) and restored into a second, empty database.
3. The two databases were compared:

| Check                             | Before        | After         |
| --------------------------------- | ------------- | ------------- |
| Tables / rows                     | 32 / 19       | 32 / 19       |
| Constraints (CHECK / foreign key) | 196 (94 / 66) | 196 (94 / 66) |
| Triggers, indexes, enums          | 11, 138, 26   | 11, 138, 26   |
| Tables with row-level security    | 32            | 32            |
| `subscription_invoice_number_seq` | 2             | 2             |
| Recorded migrations               | 10            | 10            |

After the restore, inserting an order that points at a branch of no restaurant was rejected by the composite foreign key `orders_organization_id_branch_id…`, so tenant constraints survive a restore.

`pg_dump` output sets an empty `search_path` for the session doing the restore. Run the restore in its own `psql` or `pg_restore` session, never in an application connection.

**What the drill did not cover:**

- Supabase's managed backups and point-in-time recovery;
- Supabase-specific schemas;
- storage bucket copies;
- restore time at production size.

Run the full procedure above against a scratch Supabase project before launch.
