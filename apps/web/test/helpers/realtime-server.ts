import { createTestDeps } from '../../../server/test/helpers/test-deps.js';
import { buildRepos } from '../../../server/test/helpers/persistence.js';
import { RoomActorManager } from '../../../server/src/actors/room-actor-manager.js';
import { GatewayServer, type GatewayOptions } from '../../../server/src/gateway/gateway-server.js';
import { createRoom, joinPlayer } from '../../../server/src/fsm/room-lifecycle.js';
import { createDefaultConfig } from '../../../server/src/config/defaults.js';
import type { Deps } from '../../../server/src/types/deps.js';

/**
 * Boots a REAL `GatewayServer` (the existing WebSocket gateway, unchanged) for `RealtimeSocket`/hook
 * tests to connect to with a REAL `WebSocket` — reused directly from `apps/server`'s own test
 * helpers rather than re-implemented, per the Step 7B brief's "use existing test utilities."
 *
 * IMPORTANT: these tests intentionally run in the DEFAULT ("node") Vitest environment, never
 * `@vitest-environment jsdom` — combining jsdom's `Event`/`EventTarget` polyfills with Node's native
 * `WebSocket` (undici-based) throws `TypeError: The "event" argument must be an instance of Event`
 * on every real connection (a known cross-realm class-identity mismatch between jsdom's `Event` and
 * Node's native one). Plain Node already provides a spec-compliant global `WebSocket` that works
 * correctly against a real server without that conflict.
 */
export async function startRealtimeTestServer(seed = 1, options: GatewayOptions = {}) {
  const deps = createTestDeps(seed);
  const repos = buildRepos(deps);
  const manager = new RoomActorManager({
    fsmDeps: deps,
    roomStateRepo: repos.roomStateRepo,
    roomPrivateStateRepo: repos.roomPrivateStateRepo,
    roomLookupRepo: repos.roomLookupRepo,
    sessionRepo: repos.sessionRepo,
  });
  const gateway = new GatewayServer(
    { roomActorManager: manager, roomLookupRepo: repos.roomLookupRepo, sessionRepo: repos.sessionRepo, fsmDeps: deps },
    { authTimeoutMs: 3000, heartbeatIntervalMs: 60_000, ...options },
  );
  const port = await gateway.listen(0);

  return {
    deps,
    repos,
    manager,
    gateway,
    wsBaseUrl: `ws://127.0.0.1:${port}`,
    close: () => gateway.close(),
  };
}

export type RealtimeTestServer = Awaited<ReturnType<typeof startRealtimeTestServer>>;

export interface SeededPlayer {
  playerId: string;
  sessionToken: string;
  name: string;
}

export interface SeededRoom {
  roomId: string;
  roomCode: string;
  hostSessionToken: string;
  players: SeededPlayer[];
}

/**
 * Persists a room (and optionally some already-joined players) directly via the repositories —
 * bypassing HTTP/WS entirely, exactly like `apps/server`'s own Step 3+ tests do — so each test only
 * exercises the ONE thing it's actually testing (the WebSocket client), not the whole create/join stack.
 */
export async function seedRoom(server: RealtimeTestServer, playerNames: string[] = []): Promise<SeededRoom> {
  const config = createDefaultConfig();
  const created = createRoom(config, server.deps);
  let room = created.room;
  let priv = created.priv;

  const players: SeededPlayer[] = [];
  for (const name of playerNames) {
    const result = joinPlayer(room, priv, { name, avatarId: 'default' }, server.deps);
    room = result.room;
    priv = result.priv;
    players.push({ playerId: result.playerId!, sessionToken: result.sessionToken!, name });
  }

  await server.repos.roomStateRepo.save(room);
  await server.repos.roomPrivateStateRepo.save(priv);
  await server.repos.roomLookupRepo.setRoomCode(room.roomCode, room.roomId);
  await server.repos.sessionRepo.setHostSession(created.hostSessionToken, { roomId: room.roomId });
  for (const player of players) {
    await server.repos.sessionRepo.setPlayerSession(player.sessionToken, { roomId: room.roomId, playerId: player.playerId });
  }

  return { roomId: room.roomId, roomCode: room.roomCode, hostSessionToken: created.hostSessionToken, players };
}

export type { Deps };
