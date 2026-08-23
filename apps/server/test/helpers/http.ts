import type { Deps } from '../../src/types/deps.js';
import { createTestDeps } from './test-deps.js';
import { buildRepos } from './persistence.js';
import { RoomActorManager } from '../../src/actors/room-actor-manager.js';
import { HttpApiServer, type HttpApiOptions } from '../../src/http/http-api-server.js';
import type { RoomLogger } from '../../src/persistence/logging.js';
import { buildTestBusinessBackend, createTestHost, type TestBusinessBackend, type TestHost } from './business-backend.js';

export interface TestHttpApiSetup {
  server: HttpApiServer;
  port: number;
  baseUrl: string;
  manager: RoomActorManager;
  repos: ReturnType<typeof buildRepos>;
  deps: Deps;
  /** Permanent Business Backend test wiring (in-memory, see business-backend.ts) — always present so every existing "just create a room" test keeps working with one small addition (the Cookie header + gameSlug body field) rather than needing a real Postgres connection. */
  business: TestBusinessBackend;
  /** A pre-registered User who already owns `defaultGameSlug` ('hackers') — the common case for tests that don't care about auth specifics, just "a valid host." */
  defaultHost: TestHost;
  defaultGameSlug: string;
  close(): Promise<void>;
}

export async function startTestHttpApi(options: HttpApiOptions = {}, depsOverride?: Deps, seed = 1): Promise<TestHttpApiSetup> {
  const deps = depsOverride ?? createTestDeps(seed);
  const repos = buildRepos(deps);
  const manager = new RoomActorManager({
    fsmDeps: deps,
    roomStateRepo: repos.roomStateRepo,
    roomPrivateStateRepo: repos.roomPrivateStateRepo,
    roomLookupRepo: repos.roomLookupRepo,
    sessionRepo: repos.sessionRepo,
  });

  const business = buildTestBusinessBackend();
  const defaultGameSlug = 'hackers';
  business.repos.gameRepo.seed({ slug: defaultGameSlug, name: 'لعبة الهاكر', isActive: true });
  const defaultHost = await createTestHost(business, defaultGameSlug, seed);

  const server = new HttpApiServer(
    {
      roomActorManager: manager,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      fsmDeps: deps,
      authService: business.authService,
      ownershipService: business.ownershipService,
    },
    options,
  );
  const port = await server.listen(0);
  return {
    server,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    manager,
    repos,
    deps,
    business,
    defaultHost,
    defaultGameSlug,
    close: () => server.close(),
  };
}

export interface JsonResponse<T> {
  status: number;
  body: T;
  headers: Headers;
}

/** Thin `fetch` wrapper — real Node `fetch`, real network, but to an ephemeral localhost port with no real Redis/timers involved. */
export async function requestJson<T = unknown>(url: string, init: RequestInit = {}): Promise<JsonResponse<T>> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text.length > 0 ? (JSON.parse(text) as T) : (undefined as T);
  return { status: res.status, body, headers: res.headers };
}

/** Extra RoomLogger param wiring is common enough across HTTP tests to warrant a helper import re-export point. */
export type { RoomLogger };
