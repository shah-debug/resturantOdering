import { resolve } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { startTestDatabase, type TestDatabase } from './test-database';

let database: TestDatabase | undefined;

beforeAll(async () => {
  database = await startTestDatabase(resolve(process.cwd(), 'prisma/migrations'));
  process.env.DATABASE_URL = database.url;
}, 60_000);

afterAll(async () => {
  await database?.stop();
  database = undefined;
});
