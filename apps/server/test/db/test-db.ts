// Real PostgreSQL integration test infrastructure (PART 12) — a real, separate database
// (TEST_DATABASE_URL), never mocks. Migrated once via `npm run db:migrate:test`, then isolated
// between individual tests by truncating every business table (the simplest robust strategy at
// this schema's small scale — no interactive-transaction plumbing needed).
import { config as loadDotenv } from 'dotenv';
import { createPrismaClient, type PrismaClient } from '../../src/db/client.js';

loadDotenv({ path: new URL('../../.env', import.meta.url) });

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set — copy apps/server/.env.example to apps/server/.env, then run `npm run dev:db && npm run db:migrate:test`.');
}

export function createTestPrismaClient(): PrismaClient {
  return createPrismaClient(TEST_DATABASE_URL!);
}

/** FK-safe truncate order (children before/with parents — CASCADE handles the rest). uuid primary keys mean no identity sequence to reset. */
export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "auth_sessions", "game_ownerships", "games", "users" RESTART IDENTITY CASCADE');
}
