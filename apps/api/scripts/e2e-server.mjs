import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(root, 'prisma', 'migrations');
const databasePort = Number(process.env.E2E_DATABASE_PORT ?? 54600);

const db = await PGlite.create();
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const name of migrations) {
  await db.exec(readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'));
}
const server = new PGLiteSocketServer({ db, port: databasePort, host: '127.0.0.1' });
await server.start();

Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: process.env.E2E_API_PORT ?? '4100',
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres`,
  DATABASE_POOL_MAX: '1',
  APP_ORIGINS: process.env.E2E_APP_ORIGINS ?? 'http://localhost:3100',
  DASHBOARD_URL: process.env.E2E_APP_ORIGINS ?? 'http://localhost:3100',
  AUTH_RATE_LIMIT_MAX_REQUESTS: '1000',
  RATE_LIMIT_MAX_REQUESTS: '10000',
  MAIL_TRANSPORT: 'log',
});

require(join(root, 'dist', 'main.js'));
