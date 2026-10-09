import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

it('verifies the edge SQL contracts against isolated PostgreSQL', () => {
  // The separate Node process lets PGlite load its WASM without changing the
  // existing Jest VM. The fixture never imports dotenv or a real database URL.
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', '--test', 'src/cloudflare/test-support/database.integration.ts',
  ], {
    cwd: resolve(process.cwd()), encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, NODE_ENV: 'test' }, windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Isolated PostgreSQL tests failed:\n${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
  }
}, 65_000);
