// Root-level Prisma config so every `prisma` CLI invocation runs from the repo root (matching every
// other npm script in this monorepo — apps/server has no package.json of its own, see
// PERMANENT_BACKEND_FOUNDATION_REPORT.md's Architecture section) without needing per-command
// --schema/--config flags. Explicitly loads apps/server/.env (not the repo root, which has none)
// since that's the one source of truth for DATABASE_URL/TEST_DATABASE_URL — see apps/server/env.ts.
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadDotenv({ path: 'apps/server/.env' });

export default defineConfig({
  schema: 'apps/server/prisma/schema.prisma',
  migrations: {
    path: 'apps/server/prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
