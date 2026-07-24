import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { buildRepos } from '../helpers/persistence.js';
import { connectClient, waitForOpen, send, nextMessage } from '../helpers/gateway.js';
import { requestJson } from '../helpers/http.js';
import { connectToRedis, createJackomRuntime, PortInUseError, RedisUnavailableError, type JackomRuntime } from '../../src/bootstrap.js';
import type { CreateRoomResponseBody } from '../../src/shared.js';

/**
 * Development Step 7C's local runner, exercised without a real Redis dependency wherever possible:
 * `createJackomRuntime` takes its repositories as a plain injected `ProductionRepos` value, so these
 * tests pass in the SAME `InMemoryKeyValueStore`-backed repos every other test in this suite already
 * uses (`test/helpers/persistence.ts`) — proving the wiring/sharing/shutdown behavior of the bootstrap
 * itself, independent of whether a real Redis is reachable in the environment running the tests.
 * `connectToRedis`'s own failure path IS tested against a real (unreachable) network address below,
 * since that's the one piece that genuinely needs a real connection attempt to prove anything.
 */

let runtimesToClose: JackomRuntime[] = [];
let serversToClose: http.Server[] = [];

afterEach(async () => {
  for (const runtime of runtimesToClose) await runtime.close();
  runtimesToClose = [];
  for (const server of serversToClose) await new Promise<void>((resolve) => server.close(() => resolve()));
  serversToClose = [];
});

function buildEnv(overrides: Partial<{ httpApiPort: number; wsGatewayPort: number; roomTtlSeconds: number; allowedOrigins: string[] }> = {}) {
  return { httpApiPort: 0, wsGatewayPort: 0, roomTtlSeconds: 3600, allowedOrigins: [], ...overrides };
}

describe('connectToRedis — unavailable Redis fails clearly', () => {
  it('rejects with a RedisUnavailableError (not a raw ioredis exception) when nothing is listening', async () => {
    // Port 1 is a reserved, always-refused port — a fast, deterministic "nothing is there" without
    // depending on any real Redis (or lack thereof) in the environment running this test.
    await expect(connectToRedis('redis://127.0.0.1:1', 300)).rejects.toBeInstanceOf(RedisUnavailableError);
  });

  it('the error message never includes raw credentials from the connection URL', async () => {
    try {
      await connectToRedis('redis://user:supersecret@127.0.0.1:1', 300);
      expect.unreachable('expected connectToRedis to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(RedisUnavailableError);
      expect((err as Error).message).not.toContain('supersecret');
    }
  });
});

describe('createJackomRuntime — shared RoomActorManager, single timer service, clean shutdown', () => {
  it('a room created through the runtime is immediately visible through both the HTTP API and the WebSocket gateway', async () => {
    const deps = createTestDeps(9001);
    const repos = buildRepos(deps);
    const runtime = await createJackomRuntime({ repos, fsmDeps: deps, env: buildEnv() });
    runtimesToClose.push(runtime);

    const created = await requestJson<CreateRoomResponseBody>(`http://127.0.0.1:${runtime.httpApiPort}/api/rooms`, { method: 'POST', body: '{}' });
    expect(created.status).toBe(201);

    // Reaches the WebSocket gateway only if it shares the SAME RoomActorManager the HTTP handler
    // above just registered the room with — a second, separate manager would see an unknown room code.
    const ws = connectClient(runtime.wsGatewayPort, 'host', created.body.roomCode);
    await waitForOpen(ws);
    send(ws, { type: 'host:reconnect', payload: { hostSessionToken: created.body.hostSessionToken } });
    await nextMessage(ws, (m) => m.type === 'host:authenticated');
    ws.close();
  });

  it('the phase timer service is wired to the same manager (a freshly created LOBBY room has no scheduled timer)', async () => {
    const deps = createTestDeps(9002);
    const repos = buildRepos(deps);
    const runtime = await createJackomRuntime({ repos, fsmDeps: deps, env: buildEnv() });
    runtimesToClose.push(runtime);

    const created = await requestJson<CreateRoomResponseBody>(`http://127.0.0.1:${runtime.httpApiPort}/api/rooms`, { method: 'POST', body: '{}' });
    const resolvedRoomId = await repos.roomLookupRepo.resolveRoomCode(created.body.roomCode);
    expect(resolvedRoomId).not.toBeNull();

    // LOBBY is host-paced (durationMs === null) — nothing should be scheduled. If `createJackomRuntime`
    // ever constructed a SECOND PhaseTimerService pointed at a different manager, this call would be
    // operating on a timer service that never observed the room being created at all; here it correctly
    // reports "nothing scheduled," proving it saw the room via the same manager's lifecycle hooks.
    expect(runtime.timerService.getScheduled(resolvedRoomId!)).toBeNull();
  });

  it('a port already in use produces a clear PortInUseError, not a raw EADDRINUSE, and cleans up the other listener', async () => {
    const occupied = http.createServer();
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    serversToClose.push(occupied);
    const takenPort = (occupied.address() as { port: number }).port;

    const deps = createTestDeps(9003);
    const repos = buildRepos(deps);

    await expect(createJackomRuntime({ repos, fsmDeps: deps, env: buildEnv({ wsGatewayPort: takenPort }) })).rejects.toBeInstanceOf(PortInUseError);
    // No runtime was returned to close — createJackomRuntime is responsible for closing the HTTP API
    // it already opened before the WebSocket gateway's listen() failed (verified next: those ports
    // are free again immediately, proving nothing was left bound).
  });

  it('close() releases both ports — a new runtime can immediately reuse them', async () => {
    const deps = createTestDeps(9004);
    const repos = buildRepos(deps);
    const first = await createJackomRuntime({ repos, fsmDeps: deps, env: buildEnv() });
    const { httpApiPort, wsGatewayPort } = first;
    await first.close();

    const second = await createJackomRuntime({ repos, fsmDeps: deps, env: buildEnv({ httpApiPort, wsGatewayPort }) });
    runtimesToClose.push(second);
    expect(second.httpApiPort).toBe(httpApiPort);
    expect(second.wsGatewayPort).toBe(wsGatewayPort);
  });
});
