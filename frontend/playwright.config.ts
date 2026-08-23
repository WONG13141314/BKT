import { defineConfig } from '@playwright/test';

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: remoteBaseUrl ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: remoteBaseUrl ? undefined : {
    command: 'node ../node_modules/vite/bin/vite.js --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
