// Runs after `vite build`: keeps the 3D table's download small, so the game
// keeps opening quickly on slow connections. It adds up the 3D table's chunk
// and every chunk it loads with it, apart from the app's own entry, which every
// page loads anyway. Raise the limit only on purpose.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const LIMIT_KB = 340;
const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const names = await readdir(assets);
const find = (pattern) => names.find((name) => pattern.test(name));
const table = find(/^TabletopScene-.*\.js$/);
const entry = find(/^index-.*\.js$/);
if (!table || !entry) throw new Error('No 3D table chunk (TabletopScene-*.js) or app entry (index-*.js) in dist/assets');

const sources = new Map();
const read = async (name) => {
  if (!sources.has(name)) sources.set(name, await readFile(join(assets, name)));
  return sources.get(name);
};
/** A chunk and everything it imports statically (dynamic imports load later, on demand). */
async function closure(start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const code = (await read(name)).toString('utf8');
    for (const [, imported] of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) queue.push(imported);
  }
  return seen;
}

const alwaysLoaded = await closure(entry);
const chunks = [...await closure(table)].filter((name) => !alwaysLoaded.has(name));
let total = 0;
for (const name of chunks) total += gzipSync(await read(name), { level: 9 }).length / 1024;
if (total > LIMIT_KB) {
  console.error(`The 3D table download is ${total.toFixed(0)} KB gzipped (${chunks.join(', ')}), over the ${LIMIT_KB} KB limit.`);
  process.exit(1);
}
console.log(`3D table download: ${total.toFixed(0)} KB gzipped across ${chunks.length} files (limit ${LIMIT_KB} KB)`);
