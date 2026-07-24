import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos } from '../helpers/persistence.js';
import { requestJson } from '../helpers/http.js';
import { connectClient, waitForOpen, send, nextMessage } from '../helpers/gateway.js';
import { RoomActorManager } from '../../src/actors/room-actor-manager.js';
import { HttpApiServer } from '../../src/http/http-api-server.js';
import { GatewayServer } from '../../src/gateway/gateway-server.js';
import type { CreateRoomResponseBody, JoinRoomResponseBody } from '../../src/shared.js';

/**
 * Proves "reuse the existing server process and infrastructure" concretely: the HTTP API and the
 * WebSocket gateway are separate listeners, but share the SAME `RoomActorManager` (and therefore
 * the same in-memory actors + repositories) — a room/session created over HTTP is immediately
 * usable over the WebSocket gateway, with no re-creation, no second registration path.
 */
async function buildCombinedSetup(seed: number) {
  const deps = createTestDeps(seed);
  const repos = buildRepos(deps);
  const manager = new RoomActorManager({
    fsmDeps: deps,
    roomStateRepo: repos.roomStateRepo,
    roomPrivateStateRepo: repos.roomPrivateStateRepo,
    roomLookupRepo: repos.roomLookupRepo,
    sessionRepo: repos.sessionRepo,
  });
  const httpApi = new HttpApiServer({ roomActorManager: manager, roomLookupRepo: repos.roomLookupRepo, sessionRepo: repos.sessionRepo, fsmDeps: deps });
  const gateway = new GatewayServer(
    { roomActorManager: manager, roomLookupRepo: repos.roomLookupRepo, sessionRepo: repos.sessionRepo, fsmDeps: deps },
    { authTimeoutMs: 3000, heartbeatIntervalMs: 60_000 },
  );

  const httpPort = await httpApi.listen(0);
  const wsPort = await gateway.listen(0);

  return {
    httpBaseUrl: `http://127.0.0.1:${httpPort}`,
    wsPort,
    manager,
    close: async () => {
      await httpApi.close();
      await gateway.close();
    },
  };
}

describe('HTTP API and WebSocket gateway share the same authoritative RoomActorManager', () => {
  it('a room created via HTTP is immediately connectable by its host over the WebSocket gateway', async () => {
    const setup = await buildCombinedSetup(301);
    const created = await requestJson<CreateRoomResponseBody>(`${setup.httpBaseUrl}/api/rooms`, { method: 'POST', body: '{}' });
    expect(created.status).toBe(201);

    const ws = connectClient(setup.wsPort, 'host', created.body.roomCode);
    await waitForOpen(ws);
    send(ws, { type: 'host:reconnect', payload: { hostSessionToken: created.body.hostSessionToken } });
    await nextMessage(ws, (m) => m.type === 'host:authenticated');
    const view = await nextMessage(ws, (m) => m.type === 'view:tv');
    expect((view.payload as { roomCode: string }).roomCode).toBe(created.body.roomCode);

    ws.close();
    await setup.close();
  });

  it('a player registered via HTTP is immediately connectable over the WebSocket gateway (player:reconnect)', async () => {
    const setup = await buildCombinedSetup(307);
    const created = await requestJson<CreateRoomResponseBody>(`${setup.httpBaseUrl}/api/rooms`, { method: 'POST', body: '{}' });
    const joined = await requestJson<JoinRoomResponseBody>(`${setup.httpBaseUrl}/api/rooms/${created.body.roomCode}/players`, {
      method: 'POST',
      body: JSON.stringify({ displayName: 'سارة' }),
    });
    expect(joined.status).toBe(201);

    const ws = connectClient(setup.wsPort, 'player', created.body.roomCode);
    await waitForOpen(ws);
    send(ws, { type: 'player:reconnect', payload: { sessionToken: joined.body.playerSessionToken } });
    await nextMessage(ws, (m) => m.type === 'player:reconnected');
    const view = await nextMessage(ws, (m) => m.type === 'view:player');
    expect((view.payload as { playerId: string }).playerId).toBe(joined.body.playerId);

    ws.close();
    await setup.close();
  });
});
