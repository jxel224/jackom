import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Permanent-business-data database client (PostgreSQL, via Prisma). Deliberately a FACTORY, not a
 * module-level singleton — matches this codebase's existing rule that every real ambient resource
 * (Redis client, `Date.now`/`Math.random`) is constructed once by a caller and passed in, never
 * reached for globally, so tests can point an isolated instance at `TEST_DATABASE_URL` without any
 * production code path ever touching it. Prisma 7's client requires an explicit driver adapter
 * (`@prisma/adapter-pg`) — there is no more auto-connecting bundled query-engine binary.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export type { PrismaClient } from '../generated/prisma/client.js';
export * from '../generated/prisma/client.js';
