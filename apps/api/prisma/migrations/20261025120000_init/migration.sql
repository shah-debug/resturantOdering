-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "promotion_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_DELIVERY');

-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "order_channel" AS ENUM ('STOREFRONT', 'DASHBOARD');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "status_actor_type" AS ENUM ('SYSTEM', 'STAFF', 'CUSTOMER', 'RIDER');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'CARD', 'JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "order_payment_status" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('SUPER_ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "billing_interval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "vehicle_type" AS ENUM ('MOTORCYCLE', 'BICYCLE', 'CAR', 'ON_FOOT');

-- CreateEnum
CREATE TYPE "rider_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "rider_availability" AS ENUM ('OFFLINE', 'AVAILABLE', 'ON_DELIVERY');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('OWNER', 'MANAGER', 'ORDER_STAFF', 'KITCHEN_STAFF', 'RIDER');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "branch_status" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "image_url" VARCHAR(2048),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sku" VARCHAR(64),
    "price_minor" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_on_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "add_on_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_ons" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "add_on_group_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "price_minor" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_add_on_groups" (
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "add_on_group_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_add_on_groups_pkey" PRIMARY KEY ("product_id","add_on_group_id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "blocked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "label" VARCHAR(40),
    "address_line" VARCHAR(255) NOT NULL,
    "area" VARCHAR(120),
    "city" VARCHAR(80) NOT NULL,
    "landmark" VARCHAR(160),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "delivery_instructions" VARCHAR(500),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "fee_minor" INTEGER NOT NULL,
    "min_order_minor" INTEGER NOT NULL DEFAULT 0,
    "radius_meters" INTEGER,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 45,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zone_areas" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "delivery_zone_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,

    CONSTRAINT "delivery_zone_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "type" "promotion_type" NOT NULL,
    "percent_bps" INTEGER,
    "amount_minor" INTEGER,
    "max_discount_minor" INTEGER,
    "min_order_minor" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "usage_limit" INTEGER,
    "per_customer_limit" INTEGER,
    "times_redeemed" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_number" INTEGER NOT NULL,
    "type" "order_type" NOT NULL,
    "channel" "order_channel" NOT NULL DEFAULT 'STOREFRONT',
    "status" "order_status" NOT NULL DEFAULT 'PENDING',
    "status_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_method" "payment_method" NOT NULL,
    "payment_status" "order_payment_status" NOT NULL DEFAULT 'UNPAID',
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "subtotal_minor" INTEGER NOT NULL,
    "discount_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "prices_include_tax" BOOLEAN NOT NULL DEFAULT false,
    "delivery_fee_minor" INTEGER NOT NULL DEFAULT 0,
    "delivery_discount_minor" INTEGER NOT NULL DEFAULT 0,
    "rounding_adjustment_minor" INTEGER NOT NULL DEFAULT 0,
    "total_minor" INTEGER NOT NULL,
    "promotion_id" UUID,
    "promotion_code" VARCHAR(40),
    "customer_name" VARCHAR(120) NOT NULL,
    "customer_phone" VARCHAR(16) NOT NULL,
    "delivery_zone_id" UUID,
    "delivery_address_line" VARCHAR(255),
    "delivery_area" VARCHAR(120),
    "delivery_city" VARCHAR(80),
    "delivery_landmark" VARCHAR(160),
    "delivery_latitude" DECIMAL(9,6),
    "delivery_longitude" DECIMAL(9,6),
    "delivery_instructions" VARCHAR(500),
    "rider_id" UUID,
    "customer_note" VARCHAR(500),
    "cancellation_reason" VARCHAR(500),
    "idempotency_key" VARCHAR(64),
    "scheduled_for" TIMESTAMPTZ(3),
    "placed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_name" VARCHAR(160) NOT NULL,
    "variant_name" VARCHAR(80) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "add_ons_total_minor" INTEGER NOT NULL DEFAULT 0,
    "line_subtotal_minor" INTEGER NOT NULL,
    "discount_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_minor" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_add_ons" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "add_on_id" UUID NOT NULL,
    "group_name" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "order_item_add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "order_status",
    "to_status" "order_status" NOT NULL,
    "actor_type" "status_actor_type" NOT NULL,
    "changed_by_user_id" UUID,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "method" "payment_method" NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "amount_minor" INTEGER NOT NULL,
    "refunded_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "provider_reference" VARCHAR(128),
    "failure_reason" VARCHAR(500),
    "collected_by_rider_id" UUID,
    "paid_at" TIMESTAMPTZ(3),
    "refunded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(16),
    "full_name" VARCHAR(120) NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "platform_role" "platform_role",
    "email_verified_at" TIMESTAMPTZ(3),
    "phone_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "billing_interval" "billing_interval" NOT NULL DEFAULT 'MONTHLY',
    "max_branches" INTEGER,
    "max_products" INTEGER,
    "max_riders" INTEGER,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "user_id" UUID,
    "full_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "vehicle_type" "vehicle_type" NOT NULL DEFAULT 'MOTORCYCLE',
    "vehicle_number" VARCHAR(20),
    "status" "rider_status" NOT NULL DEFAULT 'ACTIVE',
    "availability" "rider_availability" NOT NULL DEFAULT 'OFFLINE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "template" VARCHAR(80) NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(1000),
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),
    "order_id" UUID,
    "customer_id" UUID,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64),
    "changes" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "legal_name" VARCHAR(200),
    "ntn" VARCHAR(20),
    "status" "organization_status" NOT NULL DEFAULT 'ACTIVE',
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Karachi',
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(16),
    "logo_url" VARCHAR(2048),
    "primary_color" CHAR(7),
    "last_order_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_domains" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" VARCHAR(128),
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID,
    "role" "membership_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'INVITED',
    "invited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "status" "branch_status" NOT NULL DEFAULT 'ACTIVE',
    "is_accepting_orders" BOOLEAN NOT NULL DEFAULT true,
    "phone" VARCHAR(16),
    "address_line" VARCHAR(255) NOT NULL,
    "area" VARCHAR(120),
    "city" VARCHAR(80) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "prices_include_tax" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "subscription_status" NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "billing_interval" "billing_interval" NOT NULL,
    "current_period_start" TIMESTAMPTZ(3) NOT NULL,
    "current_period_end" TIMESTAMPTZ(3) NOT NULL,
    "trial_ends_at" TIMESTAMPTZ(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_organization_id_sort_order_idx" ON "categories"("organization_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_id_key" ON "categories"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_slug_key" ON "categories"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "products_organization_id_category_id_sort_order_idx" ON "products"("organization_id", "category_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_id_key" ON "products"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_slug_key" ON "products"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "product_variants_organization_id_product_id_sort_order_idx" ON "product_variants"("organization_id", "product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_id_key" ON "product_variants"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_id_key" ON "product_variants"("product_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_sku_key" ON "product_variants"("organization_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_one_default_per_product_key" ON "product_variants"("product_id") WHERE ("is_default" = true);

-- CreateIndex
CREATE UNIQUE INDEX "add_on_groups_organization_id_id_key" ON "add_on_groups"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "add_on_groups_organization_id_name_key" ON "add_on_groups"("organization_id", "name");

-- CreateIndex
CREATE INDEX "add_ons_organization_id_add_on_group_id_sort_order_idx" ON "add_ons"("organization_id", "add_on_group_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "add_ons_organization_id_id_key" ON "add_ons"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "add_ons_add_on_group_id_name_key" ON "add_ons"("add_on_group_id", "name");

-- CreateIndex
CREATE INDEX "product_add_on_groups_organization_id_add_on_group_id_idx" ON "product_add_on_groups"("organization_id", "add_on_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_id_key" ON "customers"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_phone_key" ON "customers"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "customer_addresses_organization_id_customer_id_idx" ON "customer_addresses"("organization_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_addresses_one_default_per_customer_key" ON "customer_addresses"("customer_id") WHERE ("is_default" = true);

-- CreateIndex
CREATE INDEX "delivery_zones_organization_id_branch_id_idx" ON "delivery_zones"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_organization_id_id_key" ON "delivery_zones"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_branch_id_name_key" ON "delivery_zones"("branch_id", "name");

-- CreateIndex
CREATE INDEX "delivery_zone_areas_organization_id_name_idx" ON "delivery_zone_areas"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zone_areas_delivery_zone_id_name_key" ON "delivery_zone_areas"("delivery_zone_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_organization_id_id_key" ON "promotions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_organization_id_code_key" ON "promotions"("organization_id", "code");

-- CreateIndex
CREATE INDEX "orders_organization_id_placed_at_idx" ON "orders"("organization_id", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "orders_organization_id_branch_id_status_placed_at_idx" ON "orders"("organization_id", "branch_id", "status", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "orders_organization_id_customer_id_placed_at_idx" ON "orders"("organization_id", "customer_id", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "orders_organization_id_rider_id_status_idx" ON "orders"("organization_id", "rider_id", "status");

-- CreateIndex
CREATE INDEX "orders_organization_id_delivery_zone_id_idx" ON "orders"("organization_id", "delivery_zone_id");

-- CreateIndex
CREATE INDEX "orders_organization_id_promotion_id_idx" ON "orders"("organization_id", "promotion_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_organization_id_id_key" ON "orders"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_organization_id_order_number_key" ON "orders"("organization_id", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_organization_id_idempotency_key_key" ON "orders"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "order_items_organization_id_order_id_idx" ON "order_items"("organization_id", "order_id");

-- CreateIndex
CREATE INDEX "order_items_organization_id_product_id_idx" ON "order_items"("organization_id", "product_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_variant_id_idx" ON "order_items"("product_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_organization_id_id_key" ON "order_items"("organization_id", "id");

-- CreateIndex
CREATE INDEX "order_item_add_ons_organization_id_order_item_id_idx" ON "order_item_add_ons"("organization_id", "order_item_id");

-- CreateIndex
CREATE INDEX "order_item_add_ons_organization_id_add_on_id_idx" ON "order_item_add_ons"("organization_id", "add_on_id");

-- CreateIndex
CREATE INDEX "order_status_history_organization_id_order_id_id_idx" ON "order_status_history"("organization_id", "order_id", "id");

-- CreateIndex
CREATE INDEX "order_status_history_changed_by_user_id_idx" ON "order_status_history"("changed_by_user_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_order_id_idx" ON "payments"("organization_id", "order_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_created_at_idx" ON "payments"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_organization_id_collected_by_rider_id_idx" ON "payments"("organization_id", "collected_by_rider_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_id_key" ON "payments"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_method_provider_reference_key" ON "payments"("organization_id", "method", "provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "riders_organization_id_branch_id_availability_idx" ON "riders"("organization_id", "branch_id", "availability");

-- CreateIndex
CREATE INDEX "riders_user_id_idx" ON "riders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "riders_organization_id_id_key" ON "riders"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "riders_organization_id_phone_key" ON "riders"("organization_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "riders_organization_id_user_id_key" ON "riders"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_pending_queue_idx" ON "notifications"("status", "scheduled_at") WHERE (status = 'PENDING');

-- CreateIndex
CREATE INDEX "notifications_organization_id_created_at_idx" ON "notifications"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_organization_id_order_id_idx" ON "notifications"("organization_id", "order_id");

-- CreateIndex
CREATE INDEX "notifications_organization_id_customer_id_idx" ON "notifications"("organization_id", "customer_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organization_domains_hostname_key" ON "organization_domains"("hostname");

-- CreateIndex
CREATE INDEX "organization_domains_organization_id_idx" ON "organization_domains"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_domains_one_primary_key" ON "organization_domains"("organization_id") WHERE ("is_primary" = true);

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_organization_id_branch_id_idx" ON "memberships"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_id_key" ON "branches"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_slug_key" ON "branches"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_created_at_idx" ON "subscriptions"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_one_current_per_organization_key" ON "subscriptions"("organization_id") WHERE (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE'));

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "add_on_groups" ADD CONSTRAINT "add_on_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "add_ons" ADD CONSTRAINT "add_ons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "add_ons" ADD CONSTRAINT "add_ons_organization_id_add_on_group_id_fkey" FOREIGN KEY ("organization_id", "add_on_group_id") REFERENCES "add_on_groups"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_add_on_groups" ADD CONSTRAINT "product_add_on_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_add_on_groups" ADD CONSTRAINT "product_add_on_groups_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_add_on_groups" ADD CONSTRAINT "product_add_on_groups_organization_id_add_on_group_id_fkey" FOREIGN KEY ("organization_id", "add_on_group_id") REFERENCES "add_on_groups"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_zone_areas" ADD CONSTRAINT "delivery_zone_areas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_zone_areas" ADD CONSTRAINT "delivery_zone_areas_organization_id_delivery_zone_id_fkey" FOREIGN KEY ("organization_id", "delivery_zone_id") REFERENCES "delivery_zones"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_delivery_zone_id_fkey" FOREIGN KEY ("organization_id", "delivery_zone_id") REFERENCES "delivery_zones"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_rider_id_fkey" FOREIGN KEY ("organization_id", "rider_id") REFERENCES "riders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_promotion_id_fkey" FOREIGN KEY ("organization_id", "promotion_id") REFERENCES "promotions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_order_id_fkey" FOREIGN KEY ("organization_id", "order_id") REFERENCES "orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_variant_id_fkey" FOREIGN KEY ("product_id", "variant_id") REFERENCES "product_variants"("product_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_item_add_ons" ADD CONSTRAINT "order_item_add_ons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_item_add_ons" ADD CONSTRAINT "order_item_add_ons_organization_id_order_item_id_fkey" FOREIGN KEY ("organization_id", "order_item_id") REFERENCES "order_items"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_item_add_ons" ADD CONSTRAINT "order_item_add_ons_organization_id_add_on_id_fkey" FOREIGN KEY ("organization_id", "add_on_id") REFERENCES "add_ons"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_organization_id_order_id_fkey" FOREIGN KEY ("organization_id", "order_id") REFERENCES "orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_order_id_fkey" FOREIGN KEY ("organization_id", "order_id") REFERENCES "orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_collected_by_rider_id_fkey" FOREIGN KEY ("organization_id", "collected_by_rider_id") REFERENCES "riders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_order_id_fkey" FOREIGN KEY ("organization_id", "order_id") REFERENCES "orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
