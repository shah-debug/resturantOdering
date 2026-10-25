import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { QueryResultRow } from 'pg';
import { connectSqlClient } from '../support/sql-fixtures';

const run = promisify(execFile);
const tsxCli = resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

async function runSeed(extraArgs: string[] = []): Promise<string> {
  const { stdout } = await run(process.execPath, [tsxCli, 'prisma/seed.ts', ...extraArgs], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'development' },
    timeout: 120_000,
  });
  return stdout;
}

async function queryOne<T extends QueryResultRow>(sql: string): Promise<T | undefined> {
  const client = await connectSqlClient();
  try {
    return (await client.query<T>(sql)).rows[0];
  } finally {
    await client.end();
  }
}

describe('development seed (in-memory Postgres)', () => {
  it('refuses to run without confirming the target host', async () => {
    await expect(runSeed()).rejects.toThrow(/--target-host=127\.0\.0\.1/);
  });

  it('creates the demo tenant and satisfies every database rule at commit', async () => {
    const output = await runSeed(['--target-host=127.0.0.1']);
    expect(output).toContain('created with catalog');

    expect(
      await queryOne(`
        SELECT (SELECT count(*) FROM orders) AS orders,
               (SELECT count(*) FROM payments) AS payments,
               (SELECT count(*) FROM order_status_history) AS history
      `),
    ).toEqual({ orders: '2', payments: '1', history: '7' });

    expect(
      await queryOne(`SELECT total_minor, status FROM orders WHERE type = 'DELIVERY'`),
    ).toEqual({ total_minor: 502_200, status: 'DELIVERED' });
  });

  it('is idempotent', async () => {
    const output = await runSeed(['--target-host=127.0.0.1']);
    expect(output).toContain('already exists');
    expect(await queryOne('SELECT count(*) FROM organizations')).toEqual({ count: '1' });
  });
});
