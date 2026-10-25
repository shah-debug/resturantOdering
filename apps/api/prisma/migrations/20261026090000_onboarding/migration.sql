-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "description" VARCHAR(500),
ADD COLUMN     "onboarding_completed_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "preparation_minutes" INTEGER NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "branch_opening_hours" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "opens_at_minutes" SMALLINT NOT NULL,
    "closes_at_minutes" SMALLINT NOT NULL,

    CONSTRAINT "branch_opening_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_opening_hours_organization_id_branch_id_idx" ON "branch_opening_hours"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_opening_hours_branch_id_day_of_week_opens_at_minutes_key" ON "branch_opening_hours"("branch_id", "day_of_week", "opens_at_minutes");

-- AddForeignKey
ALTER TABLE "branch_opening_hours" ADD CONSTRAINT "branch_opening_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "branch_opening_hours" ADD CONSTRAINT "branch_opening_hours_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Rules Prisma cannot express.
-- ---------------------------------------------------------------------------

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_logo_url_check" CHECK ("logo_url" IS NULL OR "logo_url" ~ '^https://');

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_fulfillment_check" CHECK ("delivery_enabled" OR "pickup_enabled"),
  ADD CONSTRAINT "branches_preparation_minutes_check" CHECK ("preparation_minutes" BETWEEN 5 AND 240);

-- Day 1 = Monday ... 7 = Sunday (ISO 8601). Minutes since midnight in the organization's time zone.
-- closes_at_minutes <= opens_at_minutes means the interval ends the next day (e.g. 18:00-02:00).
ALTER TABLE "branch_opening_hours"
  ADD CONSTRAINT "branch_opening_hours_day_check" CHECK ("day_of_week" BETWEEN 1 AND 7),
  ADD CONSTRAINT "branch_opening_hours_minutes_check" CHECK (
    "opens_at_minutes" BETWEEN 0 AND 1439
    AND "closes_at_minutes" BETWEEN 0 AND 1439
    AND "opens_at_minutes" <> "closes_at_minutes"
  );

ALTER TABLE "branch_opening_hours" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.branch_opening_hours FROM %I', api_role);
    END IF;
  END LOOP;
END;
$$;
