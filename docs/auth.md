# Authentication and authorization

## Approach

One mechanism: **server-side sessions in an HttpOnly cookie**. There are no JWTs and no tokens readable by JavaScript.

- On login the API creates a random 256-bit session token, stores only its SHA-256 hash in `sessions`, and sets it as a cookie.
- Every request looks the session up. A session is valid only if it is not revoked, is within its absolute lifetime (`SESSION_TTL_HOURS`) and idle timeout (`SESSION_IDLE_TIMEOUT_HOURS`), and its user is `ACTIVE`. Revocation, suspension and membership changes therefore take effect on the next request.
- Browsers reach the API through the Next.js `/api/*` rewrite, so the cookie is first-party and CORS is not enabled. If the API is ever served cross-origin, enable CORS with the exact `APP_ORIGINS` and `credentials: true`; the CSRF check below stays the same.

### Cookie

| Attribute     | Development           | Production                                                    |
| ------------- | --------------------- | ------------------------------------------------------------- |
| Name          | `session`             | `__Host-session` (browser enforces Secure, Path=/, no Domain) |
| HttpOnly      | yes                   | yes                                                           |
| Secure        | no (http://localhost) | yes                                                           |
| SameSite      | Lax                   | Lax                                                           |
| Path / Domain | `/` / host-only       | `/` / host-only                                               |
| Max-Age       | `SESSION_TTL_HOURS`   | `SESSION_TTL_HOURS`                                           |

### CSRF

`SameSite=Lax` plus a server-side origin check: every `POST`, `PUT`, `PATCH` and `DELETE` must carry an `Origin` (or, failing that, `Referer`) whose origin is listed in `APP_ORIGINS`; otherwise the API answers `403 CSRF_REJECTED`. This also protects the public login and signup endpoints against login CSRF.

### Passwords

- Hashed with Node's built-in **scrypt** (N=2¹⁶, r=8, p=2, 16-byte salt, 64-byte key), stored as `scrypt$N$r$p$salt$hash`. Hashes made with older parameters are upgraded automatically at the next successful login.
- 12–128 characters, no composition rules (NIST SP 800-63B); Unicode is NFKC-normalized.
- Unknown emails still run a full hash comparison, so response time does not reveal whether an account exists.

### Sign-in protection

- `AUTH_LOCKOUT_THRESHOLD` consecutive wrong passwords lock the account for `AUTH_LOCKOUT_MINUTES` (`423 ACCOUNT_LOCKED`).
- Sensitive endpoints (signup, login, verification, password reset/change, invitation acceptance) are limited to `AUTH_RATE_LIMIT_MAX_REQUESTS` per `AUTH_RATE_LIMIT_WINDOW_SECONDS` per client IP and endpoint, on top of the global limit (`429 RATE_LIMITED`).
- Signup, resend-verification and forgot-password always answer `202` with the same message, whether or not the email exists.

### Email tokens

Single-use, random 256-bit tokens; only the SHA-256 hash is stored in `auth_tokens`. Issuing a new token invalidates older unused ones of the same purpose, and consumption is atomic.

| Purpose            | Lifetime | Effect                                                                     |
| ------------------ | -------- | -------------------------------------------------------------------------- |
| Email verification | 24 hours | Required before the first login                                            |
| Password reset     | 1 hour   | Sets the new password, verifies the email, revokes **all** sessions        |
| Invitation         | 7 days   | Activates the membership; sets a password if the person has no account yet |

## Endpoints

All under `/api/v1`. Errors use the standard envelope (`packages/contracts/src/errors.ts`).

| Method | Path                                                   | Auth                  | Notes                                   |
| ------ | ------------------------------------------------------ | --------------------- | --------------------------------------- |
| POST   | `/auth/signup`                                         | public, rate-limited  | `202` always                            |
| POST   | `/auth/email/verify`                                   | public, rate-limited  | `400 INVALID_TOKEN` if used/expired     |
| POST   | `/auth/email/resend`                                   | public, rate-limited  | `202` always                            |
| POST   | `/auth/login`                                          | public, rate-limited  | Sets cookie, returns `MeResponse`       |
| POST   | `/auth/logout`                                         | session               | Revokes current session, clears cookie  |
| POST   | `/auth/logout-all`                                     | session               | Revokes every session of the user       |
| GET    | `/auth/me`                                             | session               | User plus active memberships            |
| POST   | `/auth/password/forgot`                                | public, rate-limited  | `202` always                            |
| POST   | `/auth/password/reset`                                 | public, rate-limited  | Revokes all sessions                    |
| POST   | `/auth/password/change`                                | session, rate-limited | Revokes all other sessions              |
| POST   | `/auth/invitations/accept`                             | public, rate-limited  |                                         |
| POST   | `/organizations`                                       | session               | Creator becomes `OWNER`                 |
| GET    | `/organizations`                                       | session               | Organizations with an active membership |
| GET    | `/organizations/:organizationId`                       | `organization:read`   |                                         |
| PATCH  | `/organizations/:organizationId`                       | `organization:update` |                                         |
| GET    | `/organizations/:organizationId/members`               | `members:read`        | Paginated (`page`, `pageSize` ≤ 100)    |
| POST   | `/organizations/:organizationId/members`               | `members:manage`      | Invites by email                        |
| PATCH  | `/organizations/:organizationId/members/:membershipId` | `members:manage`      | Role, status, branch                    |
| DELETE | `/organizations/:organizationId/members/:membershipId` | `members:manage`      | Removes access immediately              |
| GET    | `/platform/organizations`                              | platform role         | `SUPER_ADMIN`, `SUPPORT`                |

## Authorization

Routes are authenticated by default; public routes opt out explicitly with `@Public()`. Organization routes use `@OrganizationRoute(...permissions)`:

1. The `:organizationId` in the URL only selects a tenant; it is never proof of access.
2. The guard loads the caller's membership for that organization on every request. No active membership (and no platform role) → `404 NOT_FOUND`, so the existence of other tenants is not revealed.
3. Members of a suspended or closed organization get `403`.
4. The role's permissions must include every permission the route requires, otherwise `403 FORBIDDEN`.
5. Services read the organization from the guard's result and scope every query by it, so a membership ID from another tenant is "not found" even through the caller's own organization route. Request bodies cannot carry an `organizationId` (unknown fields are rejected).

### Permission matrix

| Permission                                           | Owner | Manager | Order staff | Kitchen staff | Rider | Platform support | Platform super admin |
| ---------------------------------------------------- | :---: | :-----: | :---------: | :-----------: | :---: | :--------------: | :------------------: |
| organization:read                                    |   ✓   |    ✓    |      ✓      |       ✓       |   ✓   |        ✓         |          ✓           |
| organization:update                                  |   ✓   |    ✓    |             |               |       |                  |          ✓           |
| members:read                                         |   ✓   |    ✓    |             |               |       |        ✓         |          ✓           |
| members:manage                                       |   ✓   |    ✓    |             |               |       |                  |          ✓           |
| branches:read                                        |   ✓   |    ✓    |      ✓      |       ✓       |       |        ✓         |          ✓           |
| branches:manage, menu:manage                         |   ✓   |    ✓    |             |               |       |                  |          ✓           |
| orders:read                                          |   ✓   |    ✓    |      ✓      |       ✓       |       |        ✓         |          ✓           |
| orders:manage                                        |   ✓   |    ✓    |      ✓      |               |       |                  |          ✓           |
| kitchen:update                                       |   ✓   |    ✓    |             |       ✓       |       |                  |          ✓           |
| deliveries:read-assigned, deliveries:update-assigned |   ✓   |    ✓    |             |               |   ✓   |                  |          ✓           |
| audit:read                                           |   ✓   |    ✓    |             |               |       |        ✓         |          ✓           |

Membership rules enforced by the API:

- Owners can assign any role; managers can only assign order staff, kitchen staff and riders, and cannot change or remove owners or managers.
- Nobody can change or remove their own membership.
- An organization always keeps at least one active owner (checked under a row lock).
- Invited members have no access until they accept.

Menu, order, kitchen and delivery permissions are defined now and enforced by the routes added in later phases.

## Audit events

Recorded in `audit_logs` (append-only) with actor, organization, entity, client IP and user agent; passwords and tokens are never recorded:
`auth.signup`, `auth.email_verified`, `auth.login_succeeded`, `auth.login_failed`, `auth.account_locked`, `auth.logout`, `auth.logout_all`, `auth.password_reset_requested`, `auth.password_reset`, `auth.password_changed`, `organization.created`, `organization.updated`, `membership.invited`, `membership.updated`, `membership.removed`, `membership.invitation_accepted`.

## Environment variables

| Variable                         | Default                                       | Notes                                                                          |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `APP_ORIGINS`                    | `http://localhost:3000,http://localhost:3001` | Exact origins for the CSRF check; must be `https://` in production             |
| `DASHBOARD_URL`                  | `http://localhost:3000`                       | Base for links in emails                                                       |
| `SESSION_TTL_HOURS`              | `168`                                         | Absolute session lifetime                                                      |
| `SESSION_IDLE_TIMEOUT_HOURS`     | `24`                                          | Must not exceed the TTL                                                        |
| `AUTH_LOCKOUT_THRESHOLD`         | `10`                                          | Failed logins before lockout                                                   |
| `AUTH_LOCKOUT_MINUTES`           | `15`                                          | Lockout duration                                                               |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | `60`                                          | Sensitive endpoint window                                                      |
| `AUTH_RATE_LIMIT_MAX_REQUESTS`   | `10`                                          | Per IP, per endpoint, per window                                               |
| `MAIL_TRANSPORT`                 | `log`                                         | `log` (development only; prints links) or `smtp` (nodemailer)                  |
| `MAIL_FROM`                      | `Restaurant Platform <no-reply@localhost>`    | An address the SMTP account may send from                                      |
| `SMTP_HOST`                      | —                                             | Required when `MAIL_TRANSPORT=smtp`                                            |
| `SMTP_PORT`                      | `587`                                         | 587 for STARTTLS, 465 for implicit TLS                                         |
| `SMTP_SECURE`                    | `true` on port 465, otherwise `false`         | Implicit TLS; STARTTLS is required in production when this is `false`          |
| `SMTP_USER` / `SMTP_PASSWORD`    | —                                             | Set both or neither                                                            |
| `TRUST_PROXY_HOPS`               | `1`                                           | Proxies in front of the API; used for client IPs in rate limits and audit logs |

The API refuses to start in production with the `log` mail transport, non-https origins, or no database CA certificate.

## Manual provider configuration

### Supabase (database only)

The app does not use Supabase Auth. In the Supabase dashboard:

1. **Database Settings → SSL Configuration:** download the CA certificate, save it as `apps/api/certs/supabase-ca.crt` (git-ignored) and set `DATABASE_SSL_CA_PATH`. Turn on **Enforce SSL**.
2. **Connect:** copy the **session pooler** URL (port 5432) into `DATABASE_URL` without `sslmode`, and the direct or session-pooler URL into `DIRECT_URL` with `?sslmode=verify-full&sslrootcert=<path to the CA file>`.
3. Leave Supabase Auth unused. The Data API cannot read or write application tables: RLS is on with no policies and API roles have no grants.

### Email (SMTP)

Emails are sent with nodemailer through any SMTP server (your own mail server, Gmail/Google Workspace, Zoho, or your host's mailbox).

1. Get the SMTP host, port and credentials from your mail provider. For Gmail, turn on 2-Step Verification and create an **App Password**; do not use the account password.
2. Set `MAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` to an address that account may send from.
3. For a custom domain, publish SPF, DKIM and DMARC records for it so messages are not marked as spam.

Delivery failures are logged with the SMTP error code only; requests such as signup still succeed so they do not reveal whether an email exists.

### Platform administrators

There is deliberately no API to grant platform roles. Assign them with a reviewed database change:

```sql
UPDATE users SET platform_role = 'SUPPORT' WHERE email = 'person@yourcompany.com';
```

Platform roles take effect on the person's next request.

### Deployment

- Serve the dashboard and storefront over HTTPS so the `__Host-` cookie is accepted.
- Keep the API reachable only through the Next.js apps (or a trusted load balancer) and set `TRUST_PROXY_HOPS` to the number of proxies in front of it.

## Tests

`pnpm test:integration` runs the full API against an in-memory PostgreSQL 17 (PGlite) with all migrations applied: signup and verification, login and cookie attributes, invalid credentials, lockout, logout and logout-all, expired and suspended sessions, password reset and change, CSRF, sensitive-endpoint rate limits, cross-tenant reads and writes, role permissions, revoked and suspended memberships, invitations, the last-owner rule, platform roles and audit events. Integration tests use a recording mailer and a lower-cost scrypt setting for speed; production parameters are covered by unit tests.
