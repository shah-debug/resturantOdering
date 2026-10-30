# Menu management

## Model

| Concept              | Table                   | Notes                                                                                              |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| Category             | `categories`            | Ordered (`sort_order`), visible or hidden (`is_active`), archived instead of deleted               |
| Product              | `products`              | `DRAFT` or `PUBLISHED`, `is_available` (temporarily sold out), image, ordered within its category  |
| Option (variant)     | `product_variants`      | Every product has 1–20 options, exactly one default; prices live here                              |
| Customization group  | `add_on_groups`         | Reusable across products; `min_select`/`max_select` make it optional (min 0) or required (min ≥ 1) |
| Customization option | `add_ons`               | Up to 30 per group, each with a price and availability                                             |
| Product ↔ group      | `product_add_on_groups` | Up to 10 groups per product, ordered                                                               |

Prices are integer paisa. Limits: options Rs 0–100,000, add-ons Rs 0–50,000 (enforced by DTOs, the shared Zod contracts and database CHECKs).

## Draft, published and orderable

A product can be ordered only when **all** of these hold. Database triggers on `order_items` and `order_item_add_ons` enforce this on insert, so checkout cannot bypass it:

- product `PUBLISHED`, `is_available`, not archived
- its category active and not archived
- the chosen option available and not archived
- every chosen add-on available, not archived, in a non-archived group that is linked to the product

Existing orders are never affected by later menu edits: items snapshot names and prices, and the checks run only on insert. Removing an option, add-on, product or category archives it so past orders keep their references; archived option SKUs are freed and archived names get a suffix so they can be reused.

Publishing requires at least one available option. A required group must always have at least `min_select` available options. Selection counts per order line (min/max) will be validated by the checkout service.

## Endpoints

Under `/api/v1/organizations/:organizationId/menu`. Reading requires `menu:read` (owner, manager, order staff, kitchen staff, platform support); changes require `menu:manage` (owner, manager, super admin). Other restaurants' menus return 404; categories or groups from another restaurant in a request body return 400.

| Method             | Path                                     | Notes                                                                                                     |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET / POST         | `/categories`                            | List (ordered, with product counts) / create                                                              |
| PATCH / DELETE     | `/categories/:categoryId`                | Edit / archive (409 while it still has products)                                                          |
| PUT                | `/categories/order`                      | `{ ids }` — every current category exactly once                                                           |
| PUT                | `/categories/:categoryId/products/order` | `{ ids }` — every product in the category exactly once                                                    |
| GET                | `/products`                              | `search`, `categoryId`, `status`, `page`, `pageSize` (≤ 100)                                              |
| POST               | `/products`                              | Full product with options and group ids                                                                   |
| GET / PUT          | `/products/:productId`                   | PUT replaces options (send `id` to keep, omit to create, leave out to archive) and group links atomically |
| PATCH              | `/products/:productId`                   | `{ status?, isAvailable? }` quick toggles                                                                 |
| DELETE             | `/products/:productId`                   | Archive                                                                                                   |
| POST / DELETE      | `/products/:productId/image`             | Upload (`multipart/form-data`, field `file`) / remove                                                     |
| GET / POST         | `/add-on-groups`                         | List / create with options                                                                                |
| GET / PUT / DELETE | `/add-on-groups/:groupId`                | Read / replace options / archive (unlinks from products)                                                  |

Every change is recorded in `audit_logs` (`menu.*` actions); price changes record old and new prices per option.

## Image uploads

- One file per request, at most **5 MB** (`413 PAYLOAD_TOO_LARGE`).
- JPEG, PNG or WebP only, detected from the file's magic bytes; the client-supplied type and file name are ignored (`415 UNSUPPORTED_MEDIA_TYPE`). SVG is rejected because it can carry scripts.
- Object keys are generated by the server (`<organizationId>/products/<uuid>.<ext>`); replacing or removing an image deletes the old object.
- Known gap: images are stored as uploaded, so EXIF metadata (for example GPS from phone cameras) is not stripped yet.

### Storage configuration

| Variable                    | Default       | Notes                                                                                         |
| --------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `STORAGE_DRIVER`            | `local`       | `local` (development only, rejected in production) or `supabase`                              |
| `STORAGE_LOCAL_DIR`         | `uploads`     | Local driver: files served by `GET /api/v1/media/...` with `nosniff` and `default-src 'none'` |
| `STORAGE_BUCKET`            | `menu-images` | Supabase bucket name                                                                          |
| `SUPABASE_URL`              | —             | e.g. `https://<project-ref>.supabase.co`                                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | —             | Server-side secret; never expose it to a browser or commit it                                 |

Manual Supabase setup: **Storage → New bucket** named `menu-images`, **public** (menu photos are public; uploads still go only through the API with the service key), file size limit 5 MB, allowed MIME types `image/jpeg, image/png, image/webp`. Add the storage host to the web apps' image policy if you restrict `img-src` further.
