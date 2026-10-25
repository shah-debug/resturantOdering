import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export interface TestDatabase {
  url: string;
  stop: () => Promise<void>;
}

export function listMigrations(migrationsDir: string): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === 'object') {
          resolvePort(address.port);
        } else {
          reject(new Error('Could not determine a free port'));
        }
      });
    });
  });
}

export async function startTestDatabase(migrationsDir: string): Promise<TestDatabase> {
  const db = await PGlite.create();
  await db.exec(
    'CREATE TABLE "_prisma_migrations" ("id" varchar(36) PRIMARY KEY, "migration_name" varchar(255) NOT NULL)',
  );
  for (const name of listMigrations(migrationsDir)) {
    await db.exec(readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'));
  }

  const port = await findFreePort();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();

  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}
