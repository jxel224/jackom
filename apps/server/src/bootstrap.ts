import Redis from 'ioredis';
import type { Deps } from './types/deps.js';
import type { RoomStateRepository } from './persistence/room-state-repo.js';
import type { RoomPrivateStateRepository } from './persistence/room-private-state-repo.js';
import type { RoomLookupRepository } from './persistence/room-lookup-repo.js';
import type { SessionRepository } from './persistence/session-repo.js';
import { RedisKeyValueStore } from './persistence/redis-kv-store.js';
import { KeyValueRoomStateRepository } from './persistence/room-state-repo.js';
import { KeyValueRoomPrivateStateRepository } from './persistence/room-private-state-repo.js';
import { KeyValueRoomLookupRepository } from './persistence/room-lookup-repo.js';
import { KeyValueSessionRepository } from './persistence/session-repo.js';
import { consoleRoomLogger, type RoomLogger } from './persistence/logging.js';
import { RoomActorManager } from './actors/room-actor-manager.js';
import { PhaseTimerService } from './timers/phase-timer-service.js';
import { MatchClockService } from './timers/match-clock-service.js';
import { RealTimerScheduler } from './timers/real-timer-scheduler.js';
import { HttpApiServer } from './http/http-api-server.js';
import { GatewayServer } from './gateway/gateway-server.js';
import type { ServerEnvConfig } from './env.js';
import { redactRedisUrl } from './env.js';
import { AuthService } from './db/services/auth-service.js';
import { OwnershipService } from './db/services/ownership-service.js';
import { createPrismaClient, type PrismaClient } from './db/client.js';
import { PrismaUserRepository } from './db/repositories/user-repository.js';
import { PrismaGameRepository } from './db/repositories/game-repository.js';
import { PrismaOwnershipRepository } from './db/repositories/ownership-repository.js';
import { PrismaAuthSessionRepository } from './db/repositories/auth-session-repository.js';

/**
 * Development Step 7C's local runner bootstrap — split into small, independently testable pieces
 * (`connectToRedis`, `buildProductionRepos`, `createJackomRuntime`) rather than one monolithic
 * `main()`, mirroring this codebase's existing separation of "the one real-ambient-source file"
 * (`fsm/default-deps.ts`, `http/env.ts`) from everything downstream that only ever receives already-
 * resolved values. `main.ts` is a thin composition of these three plus process signal handling — see
 * that file for the actual entry point.
 */

export class RedisUnavailableError extends Error {
  constructor(redisUrl: string, cause: unknown) {
    super(
      `Could not connect to Redis at ${redactRedisUrl(redisUrl)}. Is Redis running? ` +
        `See LOCAL_DEVELOPMENT.md for how to start it (docker-compose.dev.yml, or a locally installed Redis).`,
      { cause },
    );
    this.name = 'RedisUnavailableError';
  }
}

/**
 * Attaches a long-lived `'error'` listener to a live-for-the-life-of-the-process Redis client
 * (fixed in this phase — GAMEPLAY_RULES_V1.md §9 / FUNCTIONAL_GAME_AUDIT.md P0 #7). `EventEmitter`
 * throws an unlistened `'error'` event as an uncaught exception, and ioredis emits exactly that
 * event for connection-level problems (a restart, a network blip) independent of any individual
 * command's promise rejecting. Without this, the first such blip crashes the whole process,
 * bypassing every command-level `RepositoryError` this codebase otherwise handles carefully. This
 * only logs and swallows — command-level failures are still surfaced as typed errors exactly as
 * before; this never pretends a failed write succeeded. Extracted as its own function (rather than
 * inlined in `connectToRedis`) so it's unit-testable without needing a live Redis connection.
 */
export function attachRedisErrorHandler(client: Redis, logger: RoomLogger = consoleRoomLogger): void {
  client.on('error', (err: unknown) => {
    const errorKind = err instanceof Error ? err.constructor.name : typeof err;
    logger({ roomId: 'redis', event: 'redis_connection_error', detail: { errorKind } });
  });
}

/**
 * Connects to Redis with a bounded timeout and a clear, actionable error on failure — never falls
 * back to an in-memory store for a real run (that fallback exists only in the test suite, via
 * `InMemoryKeyValueStore`, and is never wired into this file).
 *
 * Uses a throwaway probe client (fail-immediately `retryStrategy: () => null` + a short
 * `connectTimeout` — the exact idiom `test/persistence/redis-integration.test.ts`'s own Redis
 * reachability check already uses) purely to make THIS bounded startup check deterministic, then
 * hands back a SEPARATE, normal client (ioredis's default reconnect-with-backoff behavior) for
 * actual runtime use — a real Redis blip later shouldn't kill a long-running dev process the way it
 * should fail this one-time startup check. The returned runtime client always has
 * `attachRedisErrorHandler` applied — see that function for why this matters.
 */
export async function connectToRedis(redisUrl: string, connectTimeoutMs = 3000, logger: RoomLogger = consoleRoomLogger): Promise<Redis> {
  const probe = new Redis(redisUrl, { lazyConnect: true, retryStrategy: () => null, connectTimeout: connectTimeoutMs });
  probe.on('error', () => {}); // avoid noisy unhandled 'error' events while we're still deciding whether to give up
  try {
    await probe.connect();
    await probe.ping();
  } catch (cause) {
    probe.disconnect();
    throw new RedisUnavailableError(redisUrl, cause);
  }
  probe.disconnect();

  const runtimeClient = new Redis(redisUrl);
  attachRedisErrorHandler(runtimeClient, logger);
  return runtimeClient;
}

export class DatabaseUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      'Could not connect to PostgreSQL. Is it running? ' +
        'See LOCAL_DEVELOPMENT.md for how to start it (`npm run dev:db`, or a locally installed PostgreSQL) — never falls back to an in-memory store for a real run.',
      { cause },
    );
    this.name = 'DatabaseUnavailableError';
  }
}

/** Same bounded-startup-check idiom as `connectToRedis` — mirrors it exactly (see that function's doc comment) for the exact same reason: fail fast and clearly, rather than a mysterious first-query timeout minutes into a run. */
export async function connectToDatabase(databaseUrl: string): Promise<PrismaClient> {
  const prisma = createPrismaClient(databaseUrl);
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (cause) {
    await prisma.$disconnect().catch(() => {});
    throw new DatabaseUnavailableError(cause);
  }
  return prisma;
}

export interface BusinessServices {
  authService: AuthService;
  ownershipService: OwnershipService;
}

/** Wires the repository → service layers (PART 10) — the only place they're constructed for a real run. */
export function buildBusinessServices(prisma: PrismaClient, sessionTokenSecret: string, sessionTtlSeconds: number): BusinessServices {
  const userRepo = new PrismaUserRepository(prisma);
  const authSessionRepo = new PrismaAuthSessionRepository(prisma);
  const gameRepo = new PrismaGameRepository(prisma);
  const ownershipRepo = new PrismaOwnershipRepository(prisma);

  return {
    authService: new AuthService(userRepo, authSessionRepo, { sessionTokenSecret, sessionTtlSeconds }),
    ownershipService: new OwnershipService(gameRepo, ownershipRepo),
  };
}

export interface ProductionRepos {
  roomStateRepo: RoomStateRepository;
  roomPrivateStateRepo: RoomPrivateStateRepository;
  roomLookupRepo: RoomLookupRepository;
  sessionRepo: SessionRepository;
}

/** The only place `RedisKeyValueStore` is constructed for a real run — everything downstream only knows the repository interfaces. */
export function buildProductionRepos(redisClient: Redis): ProductionRepos {
  const store = new RedisKeyValueStore(redisClient);
  return {
    roomStateRepo: new KeyValueRoomStateRepository(store),
    roomPrivateStateRepo: new KeyValueRoomPrivateStateRepository(store),
    roomLookupRepo: new KeyValueRoomLookupRepository(store),
    sessionRepo: new KeyValueSessionRepository(store),
  };
}

export interface JackomRuntime {
  manager: RoomActorManager;
  timerService: PhaseTimerService;
  matchClockService: MatchClockService;
  httpApi: HttpApiServer;
  gateway: GatewayServer;
  httpApiPort: number;
  wsGatewayPort: number;
  /** Closes the HTTP API, the WebSocket gateway (which also shuts both timer services down), stops the idle-actor sweep, in that order. Idempotent-safe to call once. */
  close(): Promise<void>;
}

export class PortInUseError extends Error {
  constructor(
    public readonly service: string,
    public readonly port: number,
  ) {
    super(`${service} could not bind to port ${port} — it's already in use. Stop whatever is using it, or change the port in apps/server/.env.`);
    this.name = 'PortInUseError';
  }
}

async function listenOrClearError(service: string, port: number, listen: (port: number) => Promise<number>): Promise<number> {
  try {
    return await listen(port);
  } catch (err) {
    if (isAddrInUse(err)) throw new PortInUseError(service, port);
    throw err;
  }
}

function isAddrInUse(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'EADDRINUSE';
}

export interface CreateJackomRuntimeOptions {
  repos: ProductionRepos;
  fsmDeps: Deps;
  env: Pick<
    ServerEnvConfig,
    | 'httpApiPort'
    | 'wsGatewayPort'
    | 'roomTtlSeconds'
    | 'allowedOrigins'
    | 'idleActorEvictionIntervalMs'
    | 'idleActorThresholdMs'
    | 'sessionCookieSecure'
    | 'sessionTtlSeconds'
  >;
  logger?: RoomLogger;
  /** Permanent Business Backend — optional so existing tests that only exercise realtime gameplay (no Postgres) keep constructing a runtime unchanged. A real `main.ts` run always provides both. */
  authService?: AuthService;
  ownershipService?: OwnershipService;
}

/**
 * Builds ONE shared `RoomActorManager` and hands it to both the HTTP API and the WebSocket gateway
 * — the same "single authoritative room manager, two entry points" shape
 * `http-gateway-integration.test.ts` already proves works, just wired for a real, long-running local
 * process instead of a test. `PhaseTimerService` and `MatchClockService` are each constructed
 * exactly once here and register themselves as the manager's lifecycle hooks in their own
 * constructors (`RoomActorManager.setLifecycleHooks` now accumulates rather than replaces — see
 * CORE_LOGIC_PHASE1_REPORT.md §5 — so the two coexist without either one clobbering the other's
 * registration). Also starts a periodic idle-actor sweep (GAMEPLAY_RULES_V1.md §9): `unref()`'d so
 * it never blocks process shutdown, and it only ever drops in-memory actors — Redis-persisted room
 * state is untouched, and touching the room again later transparently rehydrates it.
 */
export async function createJackomRuntime(options: CreateJackomRuntimeOptions): Promise<JackomRuntime> {
  const { repos, fsmDeps, env, authService, ownershipService } = options;
  const logger = options.logger ?? consoleRoomLogger;

  const manager = new RoomActorManager({
    fsmDeps,
    roomStateRepo: repos.roomStateRepo,
    roomPrivateStateRepo: repos.roomPrivateStateRepo,
    roomLookupRepo: repos.roomLookupRepo,
    sessionRepo: repos.sessionRepo,
    ttlSeconds: env.roomTtlSeconds,
    logger,
  });

  const timerService = new PhaseTimerService({
    manager,
    createScheduler: (onExpire) => new RealTimerScheduler(onExpire, fsmDeps.now),
    now: fsmDeps.now,
    logger,
  });

  const matchClockService = new MatchClockService({
    manager,
    createScheduler: (onExpire) => new RealTimerScheduler(onExpire, fsmDeps.now),
    now: fsmDeps.now,
    logger,
  });

  const idleEvictionTimer: ReturnType<typeof setInterval> = setInterval(() => {
    manager.evictIdle(env.idleActorThresholdMs);
  }, env.idleActorEvictionIntervalMs);
  idleEvictionTimer.unref?.();

  const sharedDeps = { roomActorManager: manager, roomLookupRepo: repos.roomLookupRepo, sessionRepo: repos.sessionRepo, fsmDeps };

  const httpApi = new HttpApiServer(
    { ...sharedDeps, authService, ownershipService },
    {
      allowedOrigins: env.allowedOrigins,
      ttlSeconds: env.roomTtlSeconds,
      logger,
      sessionCookieSecure: env.sessionCookieSecure,
      sessionTtlSeconds: env.sessionTtlSeconds,
    },
  );
  const gateway = new GatewayServer({ ...sharedDeps, timerService, matchClockService }, { ttlSeconds: env.roomTtlSeconds, logger });

  const httpApiPort = await listenOrClearError('HTTP API', env.httpApiPort, (p) => httpApi.listen(p));
  let wsGatewayPort: number;
  try {
    wsGatewayPort = await listenOrClearError('WebSocket gateway', env.wsGatewayPort, (p) => gateway.listen(p));
  } catch (err) {
    await httpApi.close(); // don't leave the HTTP API listening alone if the gateway failed to bind
    throw err;
  }

  return {
    manager,
    timerService,
    matchClockService,
    httpApi,
    gateway,
    httpApiPort,
    wsGatewayPort,
    async close() {
      clearInterval(idleEvictionTimer);
      await httpApi.close();
      await gateway.close(); // also calls timerService.shutdown() and matchClockService.shutdown()
    },
  };
}
