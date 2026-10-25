-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "image_key" VARCHAR(512),
ADD COLUMN     "status" "product_status" NOT NULL DEFAULT 'DRAFT';

-- ---------------------------------------------------------------------------
-- Sensible price ceilings (minor units): Rs 100,000 per variant, Rs 50,000 per add-on.
-- ---------------------------------------------------------------------------

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_price_ceiling_check" CHECK ("price_minor" <= 10000000);

ALTER TABLE "add_ons"
  ADD CONSTRAINT "add_ons_price_ceiling_check" CHECK ("price_minor" <= 5000000);

ALTER TABLE "products"
  ADD CONSTRAINT "products_image_key_check" CHECK ("image_key" IS NULL OR "image_url" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Only orderable menu items can enter new orders. Existing orders are unaffected
-- (the checks run on INSERT only), so later menu changes never rewrite history.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "public"."enforce_orderable_order_item"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
    JOIN public.product_variants v ON v.product_id = p.id
    WHERE p.id = NEW.product_id
      AND v.id = NEW.variant_id
      AND p.status = 'PUBLISHED'
      AND p.is_available
      AND p.archived_at IS NULL
      AND c.is_active
      AND c.archived_at IS NULL
      AND v.is_available
      AND v.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Product % (variant %) is not available to order', NEW.product_id, NEW.variant_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "order_items_orderable"
  BEFORE INSERT ON "public"."order_items"
  FOR EACH ROW EXECUTE FUNCTION "public"."enforce_orderable_order_item"();

CREATE FUNCTION "public"."enforce_orderable_order_item_add_on"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.order_items i
    JOIN public.add_ons a ON a.id = NEW.add_on_id
    JOIN public.add_on_groups g ON g.id = a.add_on_group_id
    JOIN public.product_add_on_groups link
      ON link.product_id = i.product_id AND link.add_on_group_id = g.id
    WHERE i.id = NEW.order_item_id
      AND a.is_available
      AND a.archived_at IS NULL
      AND g.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Add-on % is not available for this product', NEW.add_on_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "order_item_add_ons_orderable"
  BEFORE INSERT ON "public"."order_item_add_ons"
  FOR EACH ROW EXECUTE FUNCTION "public"."enforce_orderable_order_item_add_on"();

REVOKE ALL ON FUNCTION
  "public"."enforce_orderable_order_item"(),
  "public"."enforce_orderable_order_item_add_on"()
FROM PUBLIC;
