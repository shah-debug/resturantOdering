-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dedupe_key" VARCHAR(160);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_organization_id_dedupe_key_key" ON "notifications"("organization_id", "dedupe_key");

-- A sent notification always records when it was sent.
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_sent_at_check" CHECK ("status" <> 'SENT' OR "sent_at" IS NOT NULL);

-- CreateIndex
CREATE INDEX "riders_organization_id_branch_id_status_idx" ON "riders"("organization_id", "branch_id", "status");
