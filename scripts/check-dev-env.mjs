#!/usr/bin/env node
// `npm run dev:check` (after `npm run typecheck`, which this is chained after in package.json):
// a quick, read-only diagnostic of the local dev setup — env files, dependencies, Redis reachability
// — so a founder gets clear guidance BEFORE running `npm run dev` for real, rather than a wall of
// stack traces. Every check here only warns (never throws/exits non-zero) except a genuinely broken
// REDIS_URL value — matching "npm run dev" itself as the actual hard gate for "is Redis required."
import { existsSync } from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';
import { PROJECT_ROOT } from './dev-paths.mjs';

let warnings = 0;

function ok(message) {
  console.log(`  \x1b[32m✓\x1b[0m ${message}`);
}
function warn(message) {
  warnings += 1;
  console.log(`  \x1b[33m!\x1b[0m ${message}`);
}

console.log('Jackom local development — environment check\n');

// ---- env files -----------------------------------------------------------------------------
const serverEnv = path.join(PROJECT_ROOT, 'apps/server/.env');
if (existsSync(serverEnv)) {
  ok('apps/server/.env found');
} else {
  warn('apps/server/.env not found — copy apps/server/.env.example to apps/server/.env (safe localhost defaults apply even without one).');
}

const webEnvLocal = path.join(PROJECT_ROOT, 'apps/web/.env.local');
if (existsSync(webEnvLocal)) {
  ok('apps/web/.env.local found');
} else {
  warn('apps/web/.env.local not found — copy apps/web/.env.example to apps/web/.env.local so the frontend knows the local API/WebSocket URLs.');
}

// ---- dependencies installed ------------------------------------------------------------------
if (existsSync(path.join(PROJECT_ROOT, 'node_modules'))) {
  ok('root node_modules installed');
} else {
  warn('root node_modules missing — run `npm install` first.');
}
if (existsSync(path.join(PROJECT_ROOT, 'apps/web/node_modules'))) {
  ok('apps/web/node_modules installed');
} else {
  warn('apps/web/node_modules missing — run `npm install` inside apps/web first.');
}

// ---- Redis reachability ------------------------------------------------------------------------
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const probe = new Redis(redisUrl, { lazyConnect: true, retryStrategy: () => null, connectTimeout: 1500 });
probe.on('error', () => {});
try {
  await probe.connect();
  await probe.ping();
  ok(`Redis reachable at ${redisUrl}`);
  probe.disconnect();
} catch {
  probe.disconnect();
  warn(`Redis is not reachable at ${redisUrl} — start it with \`npm run dev:redis\` (Docker) or your own local Redis before running \`npm run dev\`.`);
}

console.log(warnings === 0 ? '\nAll checks passed.' : `\n${warnings} item(s) need attention before \`npm run dev\` will fully work — see above.`);
