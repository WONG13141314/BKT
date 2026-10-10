import { defineConfig } from '@playwright/test';

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: remoteBaseUrl ?? 'http://127.0.0.1:8787',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: remoteBaseUrl ? undefined : {
    command: 'npm --prefix .. run dev:cloudflare:test',
    url: 'http://127.0.0.1:8787/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
