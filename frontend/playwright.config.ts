import { defineConfig } from '@playwright/test';

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const cloudflare = process.env.PLAYWRIGHT_CLOUDFLARE === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: remoteBaseUrl ?? (cloudflare ? 'http://127.0.0.1:8787' : 'http://127.0.0.1:5173'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: remoteBaseUrl || cloudflare ? undefined : {
    command: 'node ../node_modules/vite/bin/vite.js --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
