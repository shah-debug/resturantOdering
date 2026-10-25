-- Integrity rules that Prisma cannot express in schema.prisma.
-- Prisma does not introspect CHECK constraints or triggers, so they do not cause schema drift.

-- ---------------------------------------------------------------------------
-- Format and range checks
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized_check" CHECK ("email" = lower("email") AND "email" LIKE '%_@_%'),
  ADD CONSTRAINT "users_phone_e164_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE "plans"
  ADD CONSTRAINT "plans_price_check" CHECK ("price_minor" >= 0),
  ADD CONSTRAINT "plans_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "plans_limits_check" CHECK (
    ("max_branches" IS NULL OR "max_branches" > 0)
    AND ("max_products" IS NULL OR "max_products" > 0)
    AND ("max_riders" IS NULL OR "max_riders" > 0)
    AND "trial_days" >= 0
  );

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  ADD CONSTRAINT "organizations_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "organizations_primary_color_check" CHECK ("primary_color" IS NULL OR "primary_color" ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT "organizations_contact_email_check" CHECK ("contact_email" IS NULL OR "contact_email" = lower("contact_email")),
  ADD CONSTRAINT "organizations_contact_phone_check" CHECK ("contact_phone" IS NULL OR "contact_phone" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "organizations_last_order_number_check" CHECK ("last_order_number" >= 0);

ALTER TABLE "organization_domains"
  ADD CONSTRAINT "organization_domains_hostname_check" CHECK ("hostname" = lower("hostname") AND "hostname" ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$');

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_price_check" CHECK ("price_minor" >= 0),
  ADD CONSTRAINT "subscriptions_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "subscriptions_period_check" CHECK ("current_period_end" > "current_period_start");

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  ADD CONSTRAINT "branches_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "branches_tax_rate_check" CHECK ("tax_rate_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "branches_coordinates_check" CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL)
    OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  );

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');

ALTER TABLE "products"
  ADD CONSTRAINT "products_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_price_check" CHECK ("price_minor" >= 0);

ALTER TABLE "add_on_groups"
  ADD CONSTRAINT "add_on_groups_selection_check" CHECK ("min_select" >= 0 AND "max_select" >= 1 AND "min_select" <= "max_select");

ALTER TABLE "add_ons"
  ADD CONSTRAINT "add_ons_price_check" CHECK ("price_minor" >= 0);

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_phone_e164_check" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "customers_email_check" CHECK ("email" IS NULL OR "email" = lower("email"));

ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_addresses_coordinates_check" CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL)
    OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  );

ALTER TABLE "delivery_zones"
  ADD CONSTRAINT "delivery_zones_amounts_check" CHECK ("fee_minor" >= 0 AND "min_order_minor" >= 0),
  ADD CONSTRAINT "delivery_zones_radius_check" CHECK ("radius_meters" IS NULL OR "radius_meters" > 0),
  ADD CONSTRAINT "delivery_zones_estimate_check" CHECK ("estimated_minutes" > 0);

ALTER TABLE "riders"
  ADD CONSTRAINT "riders_phone_e164_check" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_code_format_check" CHECK ("code" ~ '^[A-Z0-9_-]{3,40}$'),
  ADD CONSTRAINT "promotions_value_check" CHECK (
    ("type" = 'PERCENTAGE' AND "percent_bps" BETWEEN 1 AND 10000 AND "amount_minor" IS NULL)
    OR ("type" = 'FIXED_AMOUNT' AND "amount_minor" > 0 AND "percent_bps" IS NULL)
    OR ("type" = 'FREE_DELIVERY' AND "percent_bps" IS NULL AND "amount_minor" IS NULL)
  ),
  ADD CONSTRAINT "promotions_limits_check" CHECK (
    ("max_discount_minor" IS NULL OR "max_discount_minor" > 0)
    AND "min_order_minor" >= 0
    AND ("usage_limit" IS NULL OR "usage_limit" > 0)
    AND ("per_customer_limit" IS NULL OR "per_customer_limit" > 0)
    AND "times_redeemed" >= 0
    AND ("usage_limit" IS NULL OR "times_redeemed" <= "usage_limit")
  ),
  ADD CONSTRAINT "promotions_window_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

-- ---------------------------------------------------------------------------
-- Orders: money, totals and type-specific rules
-- ---------------------------------------------------------------------------

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_order_number_check" CHECK ("order_number" > 0),
  ADD CONSTRAINT "orders_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "orders_customer_phone_check" CHECK ("customer_phone" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "orders_amounts_non_negative_check" CHECK (
    "subtotal_minor" >= 0 AND "discount_minor" >= 0 AND "tax_minor" >= 0
    AND "delivery_fee_minor" >= 0 AND "delivery_discount_minor" >= 0 AND "total_minor" >= 0
  ),
  ADD CONSTRAINT "orders_discount_bounds_check" CHECK (
    "discount_minor" <= "subtotal_minor" AND "delivery_discount_minor" <= "delivery_fee_minor"
  ),
  ADD CONSTRAINT "orders_tax_rate_check" CHECK ("tax_rate_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "orders_rounding_check" CHECK ("rounding_adjustment_minor" BETWEEN -99 AND 99),
  ADD CONSTRAINT "orders_total_formula_check" CHECK (
    "total_minor" = "subtotal_minor" - "discount_minor"
      + CASE WHEN "prices_include_tax" THEN 0 ELSE "tax_minor" END
      + "delivery_fee_minor" - "delivery_discount_minor"
      + "rounding_adjustment_minor"
  ),
  ADD CONSTRAINT "orders_delivery_fields_check" CHECK (
    ("type" = 'DELIVERY' AND "delivery_address_line" IS NOT NULL AND "delivery_city" IS NOT NULL)
    OR ("type" = 'PICKUP' AND "delivery_fee_minor" = 0 AND "delivery_discount_minor" = 0
        AND "rider_id" IS NULL AND "delivery_zone_id" IS NULL)
  ),
  ADD CONSTRAINT "orders_delivery_coordinates_check" CHECK (
    ("delivery_latitude" IS NULL AND "delivery_longitude" IS NULL)
    OR ("delivery_latitude" BETWEEN -90 AND 90 AND "delivery_longitude" BETWEEN -180 AND 180)
  ),
  ADD CONSTRAINT "orders_terminal_timestamps_check" CHECK (
    (("status" IN ('DELIVERED', 'COMPLETED')) = ("completed_at" IS NOT NULL))
    AND (("status" IN ('CANCELLED', 'REJECTED')) = ("cancelled_at" IS NOT NULL))
  );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 999),
  ADD CONSTRAINT "order_items_amounts_non_negative_check" CHECK (
    "unit_price_minor" >= 0 AND "add_ons_total_minor" >= 0 AND "discount_minor" >= 0 AND "tax_minor" >= 0
  ),
  ADD CONSTRAINT "order_items_line_subtotal_check" CHECK (
    "line_subtotal_minor" = ("unit_price_minor"::bigint + "add_ons_total_minor") * "quantity"
  ),
  ADD CONSTRAINT "order_items_discount_bounds_check" CHECK ("discount_minor" <= "line_subtotal_minor");

ALTER TABLE "order_item_add_ons"
  ADD CONSTRAINT "order_item_add_ons_price_check" CHECK ("unit_price_minor" >= 0),
  ADD CONSTRAINT "order_item_add_ons_quantity_check" CHECK ("quantity" BETWEEN 1 AND 99);

ALTER TABLE "order_status_history"
  ADD CONSTRAINT "order_status_history_change_check" CHECK ("from_status" IS DISTINCT FROM "to_status");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_check" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "payments_refund_bounds_check" CHECK ("refunded_amount_minor" BETWEEN 0 AND "amount_minor"),
  ADD CONSTRAINT "payments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "payments_paid_at_check" CHECK ("status" <> 'SUCCEEDED' OR "paid_at" IS NOT NULL);

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_attempts_check" CHECK ("attempts" >= 0);

-- ---------------------------------------------------------------------------
-- Order status state machine. Keep in sync with src/modules/orders/domain/order-status.ts
-- (enforced by order-status.sync.spec.ts).
-- ---------------------------------------------------------------------------

CREATE FUNCTION "public"."enforce_order_status_transition"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'New orders must start in PENDING, got %', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.type <> OLD.type THEN
    RAISE EXCEPTION 'Order type cannot change after placement' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM (VALUES
      -- transitions:start
      ('PENDING', 'CONFIRMED', NULL::text),
      ('PENDING', 'REJECTED', NULL),
      ('PENDING', 'CANCELLED', NULL),
      ('CONFIRMED', 'PREPARING', NULL),
      ('CONFIRMED', 'CANCELLED', NULL),
      ('PREPARING', 'READY', NULL),
      ('PREPARING', 'CANCELLED', NULL),
      ('READY', 'OUT_FOR_DELIVERY', 'DELIVERY'),
      ('READY', 'COMPLETED', 'PICKUP'),
      ('READY', 'CANCELLED', NULL),
      ('OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY'),
      ('OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERY'),
      ('DELIVERY_FAILED', 'OUT_FOR_DELIVERY', 'DELIVERY'),
      ('DELIVERY_FAILED', 'CANCELLED', 'DELIVERY')
      -- transitions:end
    ) AS allowed (from_status, to_status, order_type)
    WHERE allowed.from_status = OLD.status::text
      AND allowed.to_status = NEW.status::text
      AND (allowed.order_type IS NULL OR allowed.order_type = NEW.type::text)
  ) THEN
    RAISE EXCEPTION 'Invalid order status transition from % to % for % order', OLD.status, NEW.status, NEW.type
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.status_changed_at := now();
  IF NEW.status IN ('DELIVERED', 'COMPLETED') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.status IN ('CANCELLED', 'REJECTED') THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_status_transition"
  BEFORE INSERT OR UPDATE ON "public"."orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."enforce_order_status_transition"();

-- ---------------------------------------------------------------------------
-- Order consistency, checked at COMMIT (deferred) so an order and its children
-- can be written in any order within one transaction:
--   * an order has at least one item
--   * subtotal/discount/tax equal the sums over its items
--   * each item's add_ons_total equals the sum over its add-ons
--   * the latest status history entry matches the order status
-- ---------------------------------------------------------------------------

CREATE FUNCTION "public"."assert_order_consistency"(p_order_id uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
  item_count integer;
  items_subtotal bigint;
  items_discount bigint;
  items_tax bigint;
  latest_status public.order_status;
  latest_from_status public.order_status;
  previous_status public.order_status;
  history_count integer;
BEGIN
  SELECT * INTO current_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*), COALESCE(sum(line_subtotal_minor), 0), COALESCE(sum(discount_minor), 0), COALESCE(sum(tax_minor), 0)
    INTO item_count, items_subtotal, items_discount, items_tax
  FROM public.order_items
  WHERE order_id = p_order_id;

  IF item_count = 0 THEN
    RAISE EXCEPTION 'Order % has no items', p_order_id USING ERRCODE = 'check_violation';
  END IF;

  IF current_order.subtotal_minor <> items_subtotal
    OR current_order.discount_minor <> items_discount
    OR current_order.tax_minor <> items_tax THEN
    RAISE EXCEPTION 'Order % totals do not match its items (subtotal %/%, discount %/%, tax %/%)',
      p_order_id,
      current_order.subtotal_minor, items_subtotal,
      current_order.discount_minor, items_discount,
      current_order.tax_minor, items_tax
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_items i
    WHERE i.order_id = p_order_id
      AND i.add_ons_total_minor <> COALESCE((
        SELECT sum(a.unit_price_minor::bigint * a.quantity)
        FROM public.order_item_add_ons a
        WHERE a.order_item_id = i.id
      ), 0)
  ) THEN
    RAISE EXCEPTION 'Order % has an item whose add-on total does not match its add-ons', p_order_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT h.to_status, h.from_status INTO latest_status, latest_from_status
  FROM public.order_status_history h
  WHERE h.order_id = p_order_id
  ORDER BY h.id DESC
  LIMIT 1;

  IF latest_status IS DISTINCT FROM current_order.status THEN
    RAISE EXCEPTION 'Order % status % does not match its latest status history entry %',
      p_order_id, current_order.status, latest_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO history_count FROM public.order_status_history WHERE order_id = p_order_id;
  SELECT h.to_status INTO previous_status
  FROM public.order_status_history h
  WHERE h.order_id = p_order_id
  ORDER BY h.id DESC
  OFFSET 1
  LIMIT 1;

  IF (history_count = 1 AND latest_from_status IS NOT NULL)
    OR (history_count > 1 AND latest_from_status IS DISTINCT FROM previous_status) THEN
    RAISE EXCEPTION 'Order % status history is not a continuous chain (latest entry starts from %, previous entry ended at %)',
      p_order_id, latest_from_status, previous_status
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE FUNCTION "public"."check_order_consistency_from_order"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_order_consistency(NEW.id);
  RETURN NULL;
END;
$$;

CREATE FUNCTION "public"."check_order_consistency_from_child"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.assert_order_consistency(OLD.order_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.assert_order_consistency(NEW.order_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION "public"."check_order_consistency_from_add_on"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  affected_order_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT order_id INTO affected_order_id FROM public.order_items WHERE id = OLD.order_item_id;
    IF affected_order_id IS NOT NULL THEN
      PERFORM public.assert_order_consistency(affected_order_id);
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT order_id INTO affected_order_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF affected_order_id IS NOT NULL THEN
      PERFORM public.assert_order_consistency(affected_order_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "orders_consistency"
  AFTER INSERT OR UPDATE OF "status", "subtotal_minor", "discount_minor", "tax_minor" ON "public"."orders"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "public"."check_order_consistency_from_order"();

CREATE CONSTRAINT TRIGGER "order_items_consistency"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."order_items"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "public"."check_order_consistency_from_child"();

CREATE CONSTRAINT TRIGGER "order_status_history_consistency"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."order_status_history"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "public"."check_order_consistency_from_child"();

CREATE CONSTRAINT TRIGGER "order_item_add_ons_consistency"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."order_item_add_ons"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "public"."check_order_consistency_from_add_on"();

-- ---------------------------------------------------------------------------
-- Orders are business records and are never deleted (cancel them instead).
-- ---------------------------------------------------------------------------

CREATE FUNCTION "public"."prevent_order_deletion"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Orders cannot be deleted; cancel the order instead'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "orders_no_delete"
  BEFORE DELETE ON "public"."orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."prevent_order_deletion"();

CREATE TRIGGER "orders_no_truncate"
  BEFORE TRUNCATE ON "public"."orders"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."prevent_order_deletion"();

-- ---------------------------------------------------------------------------
-- Audit logs are append-only.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "public"."prevent_audit_log_mutation"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% is not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "public"."audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "public"."prevent_audit_log_mutation"();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "public"."audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."prevent_audit_log_mutation"();

-- ---------------------------------------------------------------------------
-- Supabase hardening. The app connects as the table owner through Prisma and is
-- not affected. Supabase's Data API roles (anon, authenticated) must never read
-- or write these tables: enable RLS with no policies (deny all) and revoke grants.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    '_prisma_migrations',
    'users', 'plans', 'organizations', 'organization_domains', 'memberships', 'branches', 'subscriptions',
    'categories', 'products', 'product_variants', 'add_on_groups', 'add_ons', 'product_add_on_groups',
    'customers', 'customer_addresses', 'delivery_zones', 'delivery_zone_areas', 'riders', 'promotions',
    'orders', 'order_items', 'order_item_add_ons', 'order_status_history', 'payments',
    'notifications', 'audit_logs'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION
  "public"."enforce_order_status_transition"(),
  "public"."assert_order_consistency"(uuid),
  "public"."check_order_consistency_from_order"(),
  "public"."check_order_consistency_from_child"(),
  "public"."check_order_consistency_from_add_on"(),
  "public"."prevent_audit_log_mutation"(),
  "public"."prevent_order_deletion"()
FROM PUBLIC;

-- Functions created later by this role are not executable by PUBLIC unless granted explicitly.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END;
$$;
