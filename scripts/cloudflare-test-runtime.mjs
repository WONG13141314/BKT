import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));

/** A real workerd runtime with isolated PostgreSQL. Never reads project secrets. */
export async function createTestRuntime(port = 0, { extraWorkerSource = '', roomClassName = 'GameRoom' } = {}) {
  const postgres = new PGlite();
  await postgres.waitReady;
  await postgres.exec(await readFile(resolve(root, 'backend/prisma/migrations/20260726000000_init/migration.sql'), 'utf8'));
  for (const skill of ['Addition', 'Subtraction', 'Multiplication', 'Division']) {
    await postgres.query('INSERT INTO skills (id, name) VALUES ($1, $2)', [`skill-${skill}`, skill]);
  }
  let unavailable = false;
  let queryQueue = Promise.resolve();
  const failures = [];

  function neonResult(result) {
    return {
      fields: result.fields.map((field) => ({ name: field.name, dataTypeID: field.dataTypeID })),
      rows: result.rows.map((row) => result.fields.map((field) => {
        const value = row[field.name];
        if (value === null || value === undefined) return null;
        if (value instanceof Date) return value.toISOString();
        if (field.dataTypeID === 16) return value ? 't' : 'f';
        if ([114, 3802].includes(field.dataTypeID)) return JSON.stringify(value);
        return String(value);
      })),
      rowCount: result.affectedRows ?? result.rows.length,
      command: 'SELECT', rowAsArray: true,
    };
  }

  const runtime = new Miniflare(convertV4MiniflareOptions({
    host: '127.0.0.1', port, workers: [{
    name: 'monomath-test',
    script: await readFile(resolve(root, '.cloudflare-test/bundle/worker.js'), 'utf8') + '\n' + extraWorkerSource, modules: true,
    compatibilityDate: '2026-10-06', compatibilityFlags: ['nodejs_compat'],
    bindings: {
      DATABASE_URL: 'postgresql://synthetic:synthetic@ep-local-test.neon.tech/synthetic?sslmode=require',
      JWT_SECRET: 'isolated-cloudflare-test-secret-at-least-32-characters',
      JWT_EXPIRES_IN: '90d',
    },
    durableObjects: {
      ROOMS: { className: roomClassName, useSQLite: true },
      API: { className: 'ApiService', useSQLite: true },
      PLAYERS: { className: 'PlayerDirectory', useSQLite: true },
    },
    assets: {
      directory: resolve(root, 'frontend/dist'), binding: 'ASSETS',
      run_worker_first: ['/api/*', '/ws'],
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: 'single-page-application' },
    },
    // Emulate Neon's HTTP SQL wire protocol. Every other outbound request fails.
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (url.hostname !== 'api.neon.tech' || url.pathname !== '/sql'
        || !request.headers.get('neon-connection-string')?.includes('@ep-local-test.neon.tech/')) {
        throw new Error('External network is disabled in Cloudflare integration tests');
      }
      if (unavailable) return new Response(JSON.stringify({ message: 'Synthetic database outage' }), { status: 503 });
      const body = await request.json();
      const run = queryQueue.then(async () => {
        try {
          const query = async (statement, db = postgres) => neonResult(await db.query(statement.query, statement.params));
          const result = body.queries
            ? await postgres.transaction(async (tx) => {
              const results = [];
              for (const statement of body.queries) results.push(await query(statement, tx));
              return { results };
            })
            : await query(body);
          return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
        } catch (error) {
          failures.push(error);
          console.error('[isolated SQL]', error.code ?? error.name, error.message);
          return new Response(JSON.stringify({ message: error.message, code: error.code }), { status: 400 });
        }
      });
      queryQueue = run.catch(() => {});
      return run;
    },
    }],
  }));
  const url = await runtime.ready;
  return {
    runtime, postgres, url: url.origin, failures,
    setDatabaseUnavailable(value) { unavailable = value; },
    async close() { await runtime.dispose(); await postgres.close(); },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const instance = await createTestRuntime(Number(process.env.CLOUDFLARE_TEST_PORT ?? 8787));
  console.log(`Isolated Cloudflare game test server: ${instance.url}`);
  console.log('Uses temporary PostgreSQL; no real Neon data or project secrets.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    await instance.close(); process.exit(0);
  });
}
