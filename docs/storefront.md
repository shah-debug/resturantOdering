# Customer storefront

Every published restaurant has a public ordering page at `/r/<restaurant-slug>` on the storefront app (`apps/storefront`). Customers can browse the menu, search, choose options and extras, and build a cart. Checkout, order placement and tracking are described in [checkout.md](checkout.md).

## Published restaurants

A restaurant is **published** when its organization status is `ACTIVE` and onboarding has been completed (`onboarding_completed_at` is set). Organization slugs are unique in the database, so a slug resolves to at most one restaurant.

| Address                                             | Result                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Published restaurant                                | Menu page                                                                 |
| Mixed-case slug (`/r/Tikka-House`)                  | `308` redirect to the lowercase URL                                       |
| Unknown, not yet published, `SUSPENDED` or `CLOSED` | The same `404` "This restaurant isn't available" page                     |
| Malformed slug (wrong characters or length)         | The same `404`, without calling the API                                   |
| API error or unreachable API                        | Error page with a retry button (not a 404, so it isn't cached as missing) |

Unavailable restaurants are deliberately indistinguishable: the API returns an identical `404 NOT_FOUND` body for all of them, so the storefront does not reveal whether a slug exists, is suspended, or is still being set up. Not-found pages are marked `noindex`.

## Public API

Both endpoints are public (no session), read-only, and use their own rate limit (`STOREFRONT_RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW_SECONDS` per client IP) because requests come from the storefront server rather than individual browsers.

| Method | Path                                   | Returns                                                                 |
| ------ | -------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/v1/storefront/restaurants`       | Published restaurants (`slug`, `updatedAt`) for the sitemap, max 10,000 |
| GET    | `/api/v1/storefront/restaurants/:slug` | Branding, active branches, hours, fulfillment and the public menu       |

The response contains only customer-facing fields (`storefrontSchema` in `packages/contracts`). It never includes organization ids, owner contact details, legal/tax details, SKUs, storage keys, timestamps or statuses.

Menu rules match ordering rules: only `PUBLISHED`, non-archived products in active, non-archived categories appear; empty categories are hidden; archived options, groups and extras are omitted. A product is shown as **sold out** when it is marked unavailable, has no available option, or a required customization group has fewer available extras than it requires. Only `ACTIVE` branches are listed; delivery details appear only when delivery is enabled.

## Open and closed

Opening status is computed when the page renders, in the restaurant's time zone, from the hours of branches that take online orders (accepting orders and offering pickup or delivery). Overnight hours are supported.

- **Open now** — closes at the latest closing time among open branches.
- **Closed now** — shows when it opens next ("today", "tomorrow" or the weekday). Customers can still browse and build a cart.
- **Not taking online orders** — no branch accepts orders, or no hours are published. Customers can browse, but adding to the cart is disabled.

## Cart

- Cart state lives in Redux Toolkit (`features/cart`), keyed by restaurant slug, so carts never mix between restaurants.
- It is saved to `localStorage` per restaurant (`cart:v1:<slug>`) with **only** product, option and extra ids plus quantities. Stored data is validated on load and discarded if malformed.
- Names, prices and the subtotal are always recalculated from the current server menu. Items that became unavailable are flagged and excluded from the subtotal.
- Limits: 50 lines, quantity 1–50 per line. Required groups and min/max selections are enforced in the product dialog with the same `resolveSelection` rules (in `packages/contracts`) that checkout will reuse.
- The subtotal is informational. Checkout re-validates every line, price and availability on the server and never trusts cart contents (see [checkout.md](checkout.md)).

## Data access and caching

- The page is server-rendered. Menu data is loaded through `src/server/storefront-api.ts`, a typed client that validates responses with the shared Zod schema. Pages never call the API from the browser for menu data, and the storefront uses no authenticated dashboard endpoints.
- Responses are cached by the Next.js data cache for `STOREFRONT_REVALIDATE_SECONDS` (default 30). Availability changes therefore appear within that window; set it to `0` to disable caching.

## SEO

- Title `<Restaurant> · Order online`, the restaurant description (or a generated one), Open Graph/Twitter tags with the logo, and a canonical URL of `SITE_URL/r/<slug>`.
- `Restaurant` JSON-LD (name, address, phone, opening hours), escaped before embedding.
- `/sitemap.xml` lists published restaurants; `/robots.txt` allows `/r/`, disallows `/api/`, and points to the sitemap. Both are generated per request.
- Custom domains (`organization_domains`) are not routed yet; when they are, the canonical URL should move to the restaurant's verified primary domain.

## Branding

The restaurant's primary colour (validated `#RRGGBB`) becomes the storefront's `--primary` colour through a nonce-protected `<style>` element, with black or white text chosen for contrast. Logos and menu images may be served from any `https` host.

## Configuration

| Variable                             | App        | Default                 | Notes                                          |
| ------------------------------------ | ---------- | ----------------------- | ---------------------------------------------- |
| `API_ORIGIN`                         | storefront | `http://localhost:4000` | Required in production                         |
| `SITE_URL`                           | storefront | `http://localhost:3001` | Required in production; canonical/sitemap base |
| `STOREFRONT_REVALIDATE_SECONDS`      | storefront | `30`                    | Menu cache lifetime; `0` disables caching      |
| `STOREFRONT_RATE_LIMIT_MAX_REQUESTS` | api        | `600`                   | Per client IP per rate-limit window            |

## Tests

- API integration (`test/integration/storefront.int-spec.ts`): slug resolution, collisions and case, uniform 404s for unknown/unpublished/suspended/closed restaurants, private-field exclusion, menu isolation between similarly named restaurants, availability and visibility changes, branch and delivery rules.
- API e2e: the storefront rate-limit budget is separate from the default one.
- Storefront unit tests: opening hours, cart reducer and pricing, selection rules, data-access client, SEO/branding helpers, and the storefront UI (search, dialogs, required choices, cart persistence and isolation, closed and unavailable states).
- Browser tests (`pnpm --filter @app/storefront test:browser`, Pixel 7 and desktop): ordering flow, responsive layout without horizontal scroll, cart isolation between restaurants, live availability changes, closed messaging, 404 policy, canonical redirect, metadata, sitemap and robots. They need a built API (`pnpm --filter @app/api build`) and a storefront built with `API_ORIGIN=http://localhost:4100`.
