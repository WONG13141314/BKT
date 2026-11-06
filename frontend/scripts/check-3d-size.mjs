// Runs after `vite build`: keeps the 3D table's download small, so the game
// keeps opening quickly on slow connections. Raise the limit only on purpose.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const LIMIT_KB = 340;
const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const chunk = (await readdir(assets)).find((name) => /^TabletopScene-.*\.js$/.test(name));
if (!chunk) throw new Error('No 3D table chunk (TabletopScene-*.js) in dist/assets');

const source = await readFile(join(assets, chunk));
const gzipped = gzipSync(source, { level: 9 }).length / 1024;
if (gzipped > LIMIT_KB) {
  console.error(`The 3D table download is ${gzipped.toFixed(0)} KB gzipped, over the ${LIMIT_KB} KB limit.`);
  process.exit(1);
}
console.log(`3D table download: ${gzipped.toFixed(0)} KB gzipped (limit ${LIMIT_KB} KB)`);
