import { join } from 'node:path';
import { checkMigrations } from './migration-guard';

const reports = checkMigrations(join(process.cwd(), 'prisma', 'migrations'));
const blocked = reports.filter((report) => report.approvedBecause === null);

for (const report of reports) {
  const label = report.approvedBecause ? `approved (${report.approvedBecause})` : 'NOT APPROVED';
  process.stdout.write(`${report.migration}: ${label}\n`);
  for (const item of report.destructive) {
    process.stdout.write(`  - ${item.reason}: ${item.statement}\n`);
  }
}

if (blocked.length > 0) {
  console.error(
    `\n${blocked.length} migration(s) contain destructive SQL without an "-- approved-destructive: <reason>" line. ` +
      'Split the change into backward-compatible steps, or get approval and add the line.',
  );
  process.exit(1);
}
process.stdout.write('Migration guard: no unapproved destructive statements.\n');
