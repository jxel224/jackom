import { config as loadDotenv } from 'dotenv';
import { createDefaultDeps } from './fsm/default-deps.js';
import { loadServerEnvConfig, redactRedisUrl } from './env.js';
import {
  connectToRedis,
  connectToDatabase,
  buildProductionRepos,
  buildBusinessServices,
  createJackomRuntime,
  RedisUnavailableError,
  DatabaseUnavailableError,
  PortInUseError,
  type JackomRuntime,
} from './bootstrap.js';
import type { Redis } from 'ioredis';
import type { PrismaClient } from './db/client.js';

// `npm run dev:server` is launched from the repository root, so dotenv's default `.env` lookup
// would miss this package's local development configuration.
loadDotenv({ path: new URL('../.env', import.meta.url) });

/**
 * Development Step 7C's local development entry point. Run via `npm run dev:server` (or the
 * combined `npm run dev`, which also starts the Next.js frontend) — see LOCAL_DEVELOPMENT.md.
 *
 * This file is intentionally thin: `dotenv/config` loads `apps/server/.env` (if present) into
 * `process.env` before anything else runs, then everything else is composed from `bootstrap.ts`'s
 * small, independently-tested pieces. The only things that live here are the parts that only make
 * sense for a real, long-running process — printing the startup banner and handling OS shutdown
 * signals — not anything a test would want to exercise directly.
 */

async function main(): Promise<void> {
  const env = loadServerEnvConfig();

  console.log('Starting Jackom local development server…');
  console.log(`Connecting to Redis at ${redactRedisUrl(env.redisUrl)}…`);

  let redisClient: Redis;
  try {
    redisClient = await connectToRedis(env.redisUrl);
  } catch (err) {
    if (err instanceof RedisUnavailableError) {
      console.error(`\n✖ ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  console.log('Connecting to PostgreSQL…');
  let prisma: PrismaClient;
  try {
    prisma = await connectToDatabase(env.databaseUrl);
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      console.error(`\n✖ ${err.message}\n`);
      await redisClient.quit().catch(() => {});
      process.exit(1);
    }
    throw err;
  }

  const fsmDeps = createDefaultDeps();
  const repos = buildProductionRepos(redisClient);
  const { authService, ownershipService } = buildBusinessServices(prisma, env.sessionTokenSecret, env.sessionTtlSeconds);

  let runtime: JackomRuntime;
  try {
    runtime = await createJackomRuntime({ repos, fsmDeps, env, authService, ownershipService });
  } catch (err) {
    if (err instanceof PortInUseError) {
      console.error(`\n✖ ${err.message}\n`);
      await redisClient.quit().catch(() => {});
      await prisma.$disconnect().catch(() => {});
      process.exit(1);
    }
    throw err;
  }

  printReadyBanner(env, runtime);
  registerShutdownHandlers(runtime, redisClient, prisma);
}

function printReadyBanner(env: ReturnType<typeof loadServerEnvConfig>, runtime: JackomRuntime): void {
  // Deliberately sparse: no session tokens, no room contents, no Redis data, no player payloads,
  // no database credentials — just where things are listening.
  console.log('\nJackom local development is ready\n');
  console.log(`Frontend:   ${env.frontendUrl}`);
  console.log(`HTTP API:   http://localhost:${runtime.httpApiPort}`);
  console.log(`WebSocket:  ws://localhost:${runtime.wsGatewayPort}`);
  console.log(`Redis:      connected`);
  console.log(`PostgreSQL: connected\n`);
}

function registerShutdownHandlers(runtime: JackomRuntime, redisClient: Redis, prisma: PrismaClient): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal} — shutting down Jackom local development server…`);

    // Belt-and-suspenders: don't let a hung close() leave the process running forever.
    const forceExitTimer = setTimeout(() => process.exit(1), 5000);
    forceExitTimer.unref();

    void (async () => {
      try {
        await runtime.close();
        await redisClient.quit();
        await prisma.$disconnect();
      } catch {
        // already shutting down — nothing more useful to do with a close-time error here
      } finally {
        clearTimeout(forceExitTimer);
        process.exit(0);
      }
    })();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('\n✖ Jackom local development server failed to start:\n', err);
  process.exit(1);
});
