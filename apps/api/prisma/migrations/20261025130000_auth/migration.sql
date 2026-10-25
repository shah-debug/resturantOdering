-- CreateEnum
CREATE TYPE "auth_token_purpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'INVITATION');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_login_at" TIMESTAMPTZ(3),
ADD COLUMN     "locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "password_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "password_hash" VARCHAR(255);

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "invited_by_user_id" UUID;

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "auth_token_purpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "membership_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_purpose_idx" ON "auth_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "auth_tokens_membership_id_idx" ON "auth_tokens"("membership_id");

-- CreateIndex
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "memberships_invited_by_user_id_idx" ON "memberships"("invited_by_user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Rules Prisma cannot express.
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD CONSTRAINT "users_failed_login_attempts_check" CHECK ("failed_login_attempts" >= 0);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sessions_expiry_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "auth_tokens"
  ADD CONSTRAINT "auth_tokens_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "auth_tokens_expiry_check" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "auth_tokens_invitation_membership_check" CHECK (("purpose" = 'INVITATION') = ("membership_id" IS NOT NULL));

-- Supabase hardening for the new tables (see 20261025120100_integrity_rules).
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_tokens" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.sessions, public.auth_tokens FROM %I', api_role);
    END IF;
  END LOOP;
END;
$$;
