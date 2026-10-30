import { defineConfig, devices } from '@playwright/test';

const APP_URL = 'http://localhost:3101';
const API_URL = 'http://localhost:4100';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'node ../api/scripts/e2e-server.mjs',
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      env: { E2E_APP_ORIGINS: APP_URL },
    },
    {
      command: 'pnpm exec next start --port 3101',
      url: `${APP_URL}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_ORIGIN: API_URL, SITE_URL: APP_URL, STOREFRONT_REVALIDATE_SECONDS: '0' },
    },
  ],
});
