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
import { RealTimerScheduler } from './timers/real-timer-scheduler.js';
import { HttpApiServer } from './http/http-api-server.js';
import { GatewayServer } from './gateway/gateway-server.js';
import type { ServerEnvConfig } from './env.js';
import { redactRedisUrl } from './env.js';

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
 * Connects to Redis with a bounded timeout and a clear, actionable error on failure — never falls
 * back to an in-memory store for a real run (that fallback exists only in the test suite, via
 * `InMemoryKeyValueStore`, and is never wired into this file).
 *
 * Uses a throwaway probe client (fail-immediately `retryStrategy: () => null` + a short
 * `connectTimeout` — the exact idiom `test/persistence/redis-integration.test.ts`'s own Redis
 * reachability check already uses) purely to make THIS bounded startup check deterministic, then
 * hands back a SEPARATE, normal client (ioredis's default reconnect-with-backoff behavior) for
 * actual runtime use — a real Redis blip later shouldn't kill a long-running dev process the way it
 * should fail this one-time startup check.
 */
export async function connectToRedis(redisUrl: string, connectTimeoutMs = 3000): Promise<Redis> {
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

  return new Redis(redisUrl);
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
  httpApi: HttpApiServer;
  gateway: GatewayServer;
  httpApiPort: number;
  wsGatewayPort: number;
  /** Closes the HTTP API, the WebSocket gateway (which also shuts the timer service down), in that order. Idempotent-safe to call once. */
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
  env: Pick<ServerEnvConfig, 'httpApiPort' | 'wsGatewayPort' | 'roomTtlSeconds' | 'allowedOrigins'>;
  logger?: RoomLogger;
}

/**
 * Builds ONE shared `RoomActorManager` and hands it to both the HTTP API and the WebSocket gateway
 * — the same "single authoritative room manager, two entry points" shape
 * `http-gateway-integration.test.ts` already proves works, just wired for a real, long-running local
 * process instead of a test. `PhaseTimerService` is constructed exactly once here and registers
 * itself as the manager's lifecycle hooks in its own constructor (Step 5) — there is structurally no
 * path in this function that could create a second one for the same runtime.
 */
export async function createJackomRuntime(options: CreateJackomRuntimeOptions): Promise<JackomRuntime> {
  const { repos, fsmDeps, env } = options;
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

  const sharedDeps = { roomActorManager: manager, roomLookupRepo: repos.roomLookupRepo, sessionRepo: repos.sessionRepo, fsmDeps };

  const httpApi = new HttpApiServer(sharedDeps, { allowedOrigins: env.allowedOrigins, ttlSeconds: env.roomTtlSeconds, logger });
  const gateway = new GatewayServer({ ...sharedDeps, timerService }, { ttlSeconds: env.roomTtlSeconds, logger });

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
    httpApi,
    gateway,
    httpApiPort,
    wsGatewayPort,
    async close() {
      await httpApi.close();
      await gateway.close(); // also calls timerService.shutdown()
    },
  };
}
