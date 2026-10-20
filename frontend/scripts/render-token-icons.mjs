// Saves a picture of each pewter piece to public/tokens, rendered from the same
// 3D models the board uses. Start the dev server first:
//   npm run dev --workspace=frontend
//   npm run icons --workspace=frontend
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = fileURLToPath(new URL('../public/tokens/', import.meta.url));
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/dev/token-icons.html`);
  await page.waitForFunction(() => window.__iconsDone === true, null, { timeout: 120_000 });
  const icons = await page.evaluate(() => window.__icons);
  await mkdir(out, { recursive: true });
  for (const [token, url] of Object.entries(icons)) {
    await writeFile(join(out, `${token}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`Saved tokens/${token}.png`);
  }
} finally {
  await browser.close();
}
