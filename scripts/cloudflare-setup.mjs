import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
const npm = process.env.npm_execpath;
const workerName = 'monomath-migration';
const local = {};
for (const file of ['.env', 'backend/.env', '.dev.vars']) {
  const path = join(root, file);
  if (existsSync(path)) Object.assign(local, parseEnv(readFileSync(path, 'utf8')));
}
const settings = { ...local, ...process.env };
const secrets = { DATABASE_URL: settings.DATABASE_URL, JWT_SECRET: settings.JWT_SECRET };
const hidden = Object.values(secrets).filter(Boolean);
const childEnv = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
if (settings.CLOUDFLARE_ACCOUNT_ID) childEnv.CLOUDFLARE_ACCOUNT_ID = settings.CLOUDFLARE_ACCOUNT_ID;
if (settings.CLOUDFLARE_API_TOKEN) childEnv.CLOUDFLARE_API_TOKEN = settings.CLOUDFLARE_API_TOKEN;

function safe(text) {
  for (const secret of hidden) text = text.replaceAll(secret, '[secret]');
  // Database driver failures can quote only part of a connection string.
  return text.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[database connection]');
}

function run(executable, args, { input, display = true, stream = false, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: root, env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    function receive(chunk) {
      output += chunk;
      if (stream) process.stdout.write(safe(String(chunk)));
    }
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.on('error', reject);
    child.on('close', (code) => {
      if (display && !stream && output.trim()) console.log(safe(output.trim()));
      if (code !== 0 && !allowFailure) reject(new Error(safe(output.trim()) || `Command failed (${code}).`));
      else resolve({ code, output });
    });
    child.stdin.on('error', () => {}); // A failed child may exit before consuming input.
    child.stdin.end(input);
  });
}

function cf(args, options) {
  return run(process.execPath, [wrangler, ...args], options);
}

async function account() {
  let result = await cf(['whoami', '--json'], { display: false, allowFailure: true });
  if (result.code !== 0) {
    if (process.argv.includes('--check')) throw new Error('Cloudflare sign-in is required. Run npm run setup:cloudflare.');
    console.log('Opening Cloudflare sign-in. Sign in to your free account and click Allow.');
    await cf(['login'], { stream: true });
    result = await cf(['whoami', '--json'], { display: false });
  }
  let data;
  try { data = JSON.parse(result.output); }
  catch { throw new Error('Cloudflare did not return account details. Try npx wrangler login.'); }
  if (data.loggedIn === false) throw new Error('Cloudflare sign-in has not completed.');
  const accounts = data.accounts ?? [];
  if (!childEnv.CLOUDFLARE_ACCOUNT_ID) {
    if (accounts.length !== 1) throw new Error('Set CLOUDFLARE_ACCOUNT_ID in .dev.vars to choose your Cloudflare account.');
    childEnv.CLOUDFLARE_ACCOUNT_ID = accounts[0].id;
  }
  console.log('Cloudflare account is ready.');
}

async function preparePublicHostname() {
  const result = await cf(['auth', 'token', '--json'], { display: false, allowFailure: true });
  if (result.code !== 0) throw new Error('Unable to use Cloudflare authorization. Run npx wrangler login again.');
  let credential;
  try { credential = JSON.parse(result.output); }
  catch { throw new Error('Cloudflare authorization could not be read. Run npx wrangler login again.'); }
  const headers = { 'content-type': 'application/json' };
  if (credential.token) {
    hidden.push(credential.token);
    headers.authorization = `Bearer ${credential.token}`;
  } else if (credential.key && credential.email) {
    hidden.push(credential.key);
    headers['x-auth-key'] = credential.key;
    headers['x-auth-email'] = credential.email;
  } else throw new Error('Cloudflare authorization is unavailable.');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${childEnv.CLOUDFLARE_ACCOUNT_ID}/workers/subdomain`;
  async function request(method, body) {
    const response = await fetch(endpoint, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    return response.json();
  }
  const current = await request('GET');
  if (current.success && current.result?.subdomain) {
    console.log('Existing Cloudflare public hostname is ready.');
    return;
  }
  if (!current.errors?.some((error) => error.code === 10007)) {
    throw new Error('Cloudflare could not check the public hostname. Verify your account email and retry setup.');
  }
  const candidate = `monomath-${childEnv.CLOUDFLARE_ACCOUNT_ID.slice(0, 12)}`;
  const created = await request('PUT', { subdomain: candidate });
  if (!created.success) {
    throw new Error('Cloudflare could not register a free public hostname. Open Workers & Pages in Cloudflare, create a workers.dev subdomain, then retry setup.');
  }
  console.log('Registered the free Cloudflare public hostname.');
}

async function main() {
  if (!existsSync(wrangler)) throw new Error('Dependencies are missing. Run npm ci first.');
  const branch = await run('git', ['branch', '--show-current'], { display: false });
  if (branch.output.trim() !== 'migration') throw new Error('Switch to the migration branch before running this setup.');
  if (!secrets.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(secrets.DATABASE_URL)) {
    throw new Error('Put your existing Neon DATABASE_URL in backend/.env or .dev.vars before setup.');
  }
  if (!secrets.JWT_SECRET || secrets.JWT_SECRET.length < 16) {
    throw new Error('Put your existing JWT_SECRET (at least 16 characters) in backend/.env or .dev.vars before setup.');
  }
  await account();
  console.log('Existing Neon and login-secret settings were found; their values stay private.');
  if (process.argv.includes('--check')) return;
  if (!npm) throw new Error('Start setup with npm run setup:cloudflare so the build command is available.');
  console.log('Building the website and Cloudflare game server.');
  await run(process.execPath, [npm, 'run', 'build']);
  await preparePublicHostname();
  console.log('Installing the two application secrets on the migration Worker.');
  await cf(['secret', 'bulk', '--name', workerName], { input: JSON.stringify(secrets) });
  console.log('Publishing the migration game.');
  const deployed = await cf(['deploy', '--name', workerName]);
  const url = deployed.output.match(/https:\/\/monomath-migration\.[a-z0-9-]+\.workers\.dev\b/i)?.[0];
  if (!url) throw new Error('Deployment completed, but no public link was returned. Check the Worker in Cloudflare.');
  let healthy = false;
  const healthDeadline = Date.now() + 180_000;
  for (let attempt = 0; Date.now() < healthDeadline; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(10_000) });
      healthy = response.ok && (await response.json()).status === 'ok';
      if (healthy) break;
    } catch { /* A newly registered workers.dev hostname may need time to resolve. */ }
    if (attempt % 6 === 0) console.log('Waiting for the new public address to become reachable.');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!healthy) throw new Error(`Published at ${url}, but the health check is not ready yet. Check this link again shortly.`);
  console.log(`Game is online: ${url}`);
  console.log('This Worker uses the existing Neon database. Main and the Render deployment are unchanged.');
}

main().catch((error) => {
  console.error(safe(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
