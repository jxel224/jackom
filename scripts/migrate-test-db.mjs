#!/usr/bin/env node
// `npm run db:migrate:test` — applies the same real migrations (apps/server/prisma/migrations/) to
// the SEPARATE test database (TEST_DATABASE_URL) that `db:migrate` applies to the dev one. Run this
// once after pulling new migrations, before running apps/server/test/db/*.test.ts.
import { spawnSync } from 'node:child_process';
import { config as loadDotenv } from 'dotenv';
import { PROJECT_ROOT } from './dev-paths.mjs';

loadDotenv({ path: `${PROJECT_ROOT}/apps/server/.env` });

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is not set (see apps/server/.env.example) — cannot migrate the test database.');
  process.exit(1);
}

const result = spawnSync('node', ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  stdio: 'inherit',
  cwd: PROJECT_ROOT,
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
});
process.exit(result.status ?? 1);
