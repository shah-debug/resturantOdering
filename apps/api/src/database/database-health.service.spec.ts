import { AppConfig } from '../config/app-config';
import { parseEnv } from '../config/env';
import {
  DatabaseHealthService,
  DatabaseTimeoutError,
  withTimeout,
} from './database-health.service';
import type { PrismaService } from './prisma.service';

function createService(queryRaw: () => Promise<unknown>, healthTimeoutMs = 50) {
  const config = new AppConfig(
    parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
      DATABASE_HEALTH_TIMEOUT_MS: String(healthTimeoutMs),
    }),
  );
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return new DatabaseHealthService(prisma, config);
}

describe('withTimeout', () => {
  it('resolves when the operation finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('rejects with DatabaseTimeoutError when the operation is too slow', async () => {
    const never = new Promise<never>(() => undefined);
    await expect(withTimeout(never, 10)).rejects.toBeInstanceOf(DatabaseTimeoutError);
  });
});

describe('DatabaseHealthService', () => {
  it('reports up when the query succeeds', async () => {
    const service = createService(() => Promise.resolve([{ '?column?': 1 }]));
    await expect(service.check()).resolves.toMatchObject({ status: 'up' });
  });

  it('reports down without throwing when the query fails', async () => {
    const service = createService(() => Promise.reject(new Error('connection refused')));
    await expect(service.check()).resolves.toMatchObject({ status: 'down' });
  });

  it('reports down when the database hangs', async () => {
    const service = createService(() => new Promise(() => undefined), 10);
    await expect(service.check()).resolves.toMatchObject({ status: 'down' });
  });
});
