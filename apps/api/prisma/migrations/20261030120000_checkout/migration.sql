-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotency_fingerprint" CHAR(64);

-- A storefront idempotency key always comes with the fingerprint of the request it was used for,
-- so a replay with a different body can be rejected instead of returning the wrong order.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_idempotency_pair_check" CHECK (
    ("idempotency_key" IS NULL) = ("idempotency_fingerprint" IS NULL)
  ),
  ADD CONSTRAINT "orders_idempotency_fingerprint_format_check" CHECK (
    "idempotency_fingerprint" IS NULL OR "idempotency_fingerprint" ~ '^[0-9a-f]{64}$'
  );
