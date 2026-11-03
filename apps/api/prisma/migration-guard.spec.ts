import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMigrations, findDestructiveStatements } from './migration-guard';

describe('findDestructiveStatements', () => {
  it.each([
    'DROP TABLE "orders";',
    'ALTER TABLE "orders" DROP COLUMN "note";',
    'ALTER TABLE "orders" DROP "note";',
    'TRUNCATE "notifications";',
    'DELETE FROM "sessions" WHERE revoked_at IS NOT NULL;',
    'ALTER TABLE "orders" ALTER COLUMN "total_minor" SET DATA TYPE BIGINT;',
    'ALTER TABLE "orders" RENAME COLUMN "note" TO "customer_note";',
    'ALTER TABLE "orders" RENAME TO "customer_orders";',
    'DROP TYPE "order_status";',
    'DROP SCHEMA public CASCADE;',
  ])('flags %s', (sql) => {
    expect(findDestructiveStatements(sql)).toHaveLength(1);
  });

  it.each([
    'CREATE INDEX "audit_logs_created_at_id_idx" ON "audit_logs"("created_at" DESC, "id" DESC);',
    'DROP INDEX "subscriptions_one_current_per_organization_key";',
    'ALTER TABLE "orders" DROP CONSTRAINT "orders_total_check";',
    'ALTER TABLE "plans" ALTER COLUMN "grace_days" DROP DEFAULT;',
    'ALTER TABLE "plans" ALTER COLUMN "grace_days" DROP NOT NULL;',
    'ALTER TABLE "plans" ADD COLUMN "max_members" INTEGER;',
    'UPDATE "subscriptions" SET "billing_anchor_day" = 1 WHERE "billing_anchor_day" IS NULL;',
    "ALTER TYPE \"subscription_status\" ADD VALUE 'SUSPENDED' BEFORE 'CANCELED';",
    '-- DROP TABLE "orders";\nSELECT 1;',
    'CREATE TRIGGER "orders_no_truncate" BEFORE TRUNCATE ON "orders" FOR EACH STATEMENT EXECUTE FUNCTION prevent();',
    'CREATE FUNCTION purge() RETURNS void AS $$ BEGIN DELETE FROM "sessions"; DROP TABLE "x"; END; $$ LANGUAGE plpgsql;',
  ])('allows %s', (sql) => {
    expect(findDestructiveStatements(sql)).toEqual([]);
  });
});

describe('checkMigrations', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'migrations-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function migration(name: string, sql: string) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'migration.sql'), sql);
  }

  it('reports unapproved destructive migrations and honours an explicit approval', () => {
    migration('1_safe', 'CREATE TABLE "a" ("id" uuid);');
    migration('2_drop', 'ALTER TABLE "a" DROP COLUMN "legacy";');
    migration(
      '3_approved',
      '-- approved-destructive: legacy column empty since 2026-10, owner sign-off\nALTER TABLE "a" DROP COLUMN "old";',
    );
    expect(checkMigrations(dir)).toEqual([
      expect.objectContaining({ migration: '2_drop', approvedBecause: null }),
      expect.objectContaining({
        migration: '3_approved',
        approvedBecause: 'legacy column empty since 2026-10, owner sign-off',
      }),
    ]);
  });

  it('finds nothing to block in the real migration history', () => {
    const reports = checkMigrations(join(process.cwd(), 'prisma', 'migrations'));
    expect(reports.filter((report) => report.approvedBecause === null)).toEqual([]);
  });
});
