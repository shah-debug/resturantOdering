import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

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
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: join(root, '.e2e-uploads'),
});

const loggedEmails = [];
const writeStdout = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
  const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
  if (text.includes('Email to ')) {
    loggedEmails.push(text);
  }
  return writeStdout(chunk, ...rest);
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const to = url.searchParams.get('to') ?? '';
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(loggedEmails.filter((text) => text.includes(`Email to ${to}:`))));
}).listen(Number(process.env.E2E_MAILBOX_PORT ?? 4199), '127.0.0.1');

require(join(root, 'dist', 'main.js'));
