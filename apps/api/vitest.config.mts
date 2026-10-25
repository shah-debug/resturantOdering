import { defineConfig } from 'vitest/config';

const UNREACHABLE_DATABASE_URL = 'postgresql://offline:offline@127.0.0.1:1/offline';

export default defineConfig({
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['reflect-metadata'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts', 'prisma/**/*.spec.ts'],
          env: { NODE_ENV: 'test', DATABASE_URL: UNREACHABLE_DATABASE_URL },
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          env: { NODE_ENV: 'test', DATABASE_URL: UNREACHABLE_DATABASE_URL },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int-spec.ts'],
          setupFiles: ['reflect-metadata', './test/support/integration-setup.ts'],
          env: { NODE_ENV: 'test', DATABASE_POOL_MAX: '1' },
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
