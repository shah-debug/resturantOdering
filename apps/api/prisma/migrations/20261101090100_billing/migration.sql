-- Invoice numbers (INV-000001, ...)
CREATE SEQUENCE "subscription_invoice_number_seq";

-- CreateEnum
CREATE TYPE "subscription_invoice_status" AS ENUM ('OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "subscription_payment_method" AS ENUM ('BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "subscription_payment_status" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED');

-- DropIndex
DROP INDEX "subscriptions_one_current_per_organization_key";

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "grace_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_members" INTEGER;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "billing_anchor_day" SMALLINT NOT NULL DEFAULT 1,
ADD COLUMN     "expired_at" TIMESTAMPTZ(3),
ADD COLUMN     "grace_ends_at" TIMESTAMPTZ(3),
ADD COLUMN     "status_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "suspended_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL DEFAULT ('INV-'::text || lpad((nextval('subscription_invoice_number_seq'::regclass))::text, 6, '0'::text)),
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "status" "subscription_invoice_status" NOT NULL DEFAULT 'OPEN',
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "voided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "method" "subscription_payment_method" NOT NULL,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "provider_event_id" VARCHAR(128),
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "reference" VARCHAR(64) NOT NULL,
    "reference_key" VARCHAR(64) NOT NULL,
    "paid_on" DATE NOT NULL,
    "note" VARCHAR(500),
    "evidence_key" VARCHAR(160),
    "evidence_content_type" VARCHAR(40),
    "status" "subscription_payment_status" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_by_user_id" UUID,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_number_key" ON "subscription_invoices"("number");

-- CreateIndex
CREATE INDEX "subscription_invoices_organization_id_created_at_idx" ON "subscription_invoices"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "subscription_invoices_status_due_at_idx" ON "subscription_invoices"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_organization_id_id_key" ON "subscription_invoices"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_subscription_id_period_start_key" ON "subscription_invoices"("subscription_id", "period_start");

-- CreateIndex
CREATE INDEX "subscription_payments_organization_id_submitted_at_idx" ON "subscription_payments"("organization_id", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "subscription_payments_status_submitted_at_idx" ON "subscription_payments"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "subscription_payments_organization_id_invoice_id_idx" ON "subscription_payments"("organization_id", "invoice_id");

-- CreateIndex
CREATE INDEX "subscription_payments_submitted_by_user_id_idx" ON "subscription_payments"("submitted_by_user_id");

-- CreateIndex
CREATE INDEX "subscription_payments_reviewed_by_user_id_idx" ON "subscription_payments"("reviewed_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_reference_key" ON "subscription_payments"("method", "reference_key") WHERE (status <> 'REJECTED');

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_provider_provider_event_id_key" ON "subscription_payments"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_one_default_key" ON "plans"("is_default") WHERE ("is_default" = true);

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_id_key" ON "subscriptions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_one_current_per_organization_key" ON "subscriptions"("organization_id") WHERE (status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'));

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_organization_id_subscription_id_fkey" FOREIGN KEY ("organization_id", "subscription_id") REFERENCES "subscriptions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_organization_id_invoice_id_fkey" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "subscription_invoices"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- Existing subscriptions renew on the local calendar day they started.
UPDATE "subscriptions"
SET "billing_anchor_day" = EXTRACT(DAY FROM ("current_period_start" AT TIME ZONE 'Asia/Karachi'))::smallint;

ALTER TABLE "plans"
  ADD CONSTRAINT "plans_grace_days_check" CHECK ("grace_days" BETWEEN 0 AND 60),
  ADD CONSTRAINT "plans_max_members_check" CHECK ("max_members" IS NULL OR "max_members" > 0),
  ADD CONSTRAINT "plans_default_active_check" CHECK (NOT "is_default" OR "is_active");

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_anchor_day_check" CHECK ("billing_anchor_day" BETWEEN 1 AND 31),
  ADD CONSTRAINT "subscriptions_grace_check" CHECK ("status" <> 'PAST_DUE' OR "grace_ends_at" IS NOT NULL),
  ADD CONSTRAINT "subscriptions_suspended_check" CHECK ("status" <> 'SUSPENDED' OR "suspended_at" IS NOT NULL),
  ADD CONSTRAINT "subscriptions_expired_check" CHECK ("status" <> 'EXPIRED' OR "expired_at" IS NOT NULL),
  ADD CONSTRAINT "subscriptions_canceled_check" CHECK ("status" <> 'CANCELED' OR "canceled_at" IS NOT NULL);

ALTER TABLE "subscription_invoices"
  ADD CONSTRAINT "subscription_invoices_amount_check" CHECK ("amount_minor" >= 0),
  ADD CONSTRAINT "subscription_invoices_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "subscription_invoices_period_check" CHECK ("period_end" > "period_start"),
  ADD CONSTRAINT "subscription_invoices_paid_check" CHECK (("status" = 'PAID') = ("paid_at" IS NOT NULL)),
  ADD CONSTRAINT "subscription_invoices_void_check" CHECK (("status" = 'VOID') = ("voided_at" IS NOT NULL));

-- A manually reported payment only counts once a different person has verified it.
ALTER TABLE "subscription_payments"
  ADD CONSTRAINT "subscription_payments_amount_check" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "subscription_payments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "subscription_payments_reference_check" CHECK (length("reference_key") >= 4),
  ADD CONSTRAINT "subscription_payments_review_check" CHECK (
    ("status" = 'SUBMITTED' AND "reviewed_by_user_id" IS NULL AND "reviewed_at" IS NULL AND "rejection_reason" IS NULL)
    OR ("status" = 'VERIFIED' AND "reviewed_at" IS NOT NULL AND "rejection_reason" IS NULL)
    OR ("status" = 'REJECTED' AND "reviewed_at" IS NOT NULL AND "rejection_reason" IS NOT NULL)
  ),
  ADD CONSTRAINT "subscription_payments_four_eyes_check" CHECK (
    "status" <> 'VERIFIED' OR "provider" <> 'manual'
    OR ("reviewed_by_user_id" IS NOT NULL AND "reviewed_by_user_id" IS DISTINCT FROM "submitted_by_user_id")
  ),
  ADD CONSTRAINT "subscription_payments_evidence_check" CHECK (("evidence_key" IS NULL) = ("evidence_content_type" IS NULL));

ALTER TABLE "subscription_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_payments" ENABLE ROW LEVEL SECURITY;
