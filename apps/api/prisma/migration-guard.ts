import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const APPROVAL_MARKER = /^--\s*approved-destructive:\s*(\S.{4,})$/im;

const DESTRUCTIVE_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern: /^DROP\s+(TABLE|SCHEMA|DATABASE|TYPE|VIEW|MATERIALIZED\s+VIEW)\b/i,
    reason: 'drops an object that holds or shapes data',
  },
  {
    pattern: /^ALTER\s+TABLE\b[^;]*\bDROP\s+(COLUMN\b|(?!CONSTRAINT|DEFAULT|NOT\s+NULL)"?\w)/i,
    reason: 'drops a column',
  },
  { pattern: /^TRUNCATE\b/i, reason: 'deletes every row of a table' },
  { pattern: /^(WITH\b[^;]*\b)?DELETE\s+FROM\b/i, reason: 'deletes rows' },
  {
    pattern: /^ALTER\s+TABLE\b[^;]*\bALTER\s+COLUMN\b[^;]*\b(SET\s+DATA\s+)?TYPE\b/i,
    reason: 'changes a column type, which can lose data and lock the table',
  },
  {
    pattern: /^ALTER\s+\w+\b[^;]*\bRENAME\s+(TO|COLUMN|"?\w+"?\s+TO)\b/i,
    reason: 'renames an object that the running API still uses',
  },
];

export interface DestructiveStatement {
  statement: string;
  reason: string;
}

function stripBodiesAndComments(sql: string): string {
  return sql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' $body$ ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

export function findDestructiveStatements(sql: string): DestructiveStatement[] {
  return stripBodiesAndComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
    .flatMap((statement) => {
      const match = DESTRUCTIVE_PATTERNS.find(({ pattern }) => pattern.test(statement));
      return match ? [{ statement: statement.slice(0, 160), reason: match.reason }] : [];
    });
}

export interface MigrationReport {
  migration: string;
  approvedBecause: string | null;
  destructive: DestructiveStatement[];
}

export function checkMigrations(migrationsDir: string): MigrationReport[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((migration) => {
      const file = join(migrationsDir, migration, 'migration.sql');
      if (!existsSync(file)) {
        return [];
      }
      const sql = readFileSync(file, 'utf8');
      const destructive = findDestructiveStatements(sql);
      if (destructive.length === 0) {
        return [];
      }
      return [
        { migration, approvedBecause: APPROVAL_MARKER.exec(sql)?.[1]?.trim() ?? null, destructive },
      ];
    });
}
