import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket as NodeWebSocket } from 'ws';
import { RealtimeSocket } from '../../../lib/realtime/realtime-socket';
import type { ConnectionState } from '../../../lib/realtime/types';
import { startRealtimeTestServer, seedRoom, type RealtimeTestServer } from '../../helpers/realtime-server';

/**
 * Protocol-level `RealtimeSocket` tests against a REAL `GatewayServer` (see
 * `test/helpers/realtime-server.ts` for why this file deliberately does NOT use
 * `@vitest-environment jsdom`). Every test here proves the client talks to the ACTUAL, unmodified
 * WebSocket gateway correctly — nothing here mocks the transport.
 *
 * Deliberately NOT using `@testing-library/react`'s `waitFor` here: importing it pulls in
 * `@testing-library/dom`'s DOM-oriented internals (its default error-formatting path touches
 * `document`), which reproduces a jsdom/undici `Event` instanceof crash — even though this file
 * itself never sets a jsdom environment. A tiny local polling helper sidesteps that import entirely.
 *
 * Also deliberately injecting `ws`'s own `WebSocket` client (via `RealtimeSocket`'s test-only
 * `webSocketImpl` option) instead of Node's native global `WebSocket`: connecting Node's native
 * undici-based `WebSocket` client to the gateway's `ws`-based server intermittently crashes deep
 * inside undici (`TypeError: The "event" argument must be an instance of Event`, a known undici
 * cross-realm `Event` bug), unrelated to `RealtimeSocket`'s own code. `ws`-to-`ws` is what the
 * gateway is actually tested against elsewhere in `apps/server`, and is a real spec-compliant
 * WebSocket client, so this still genuinely exercises the wire protocol end to end.
 */
const wsImpl = NodeWebSocket as unknown as typeof WebSocket;

async function waitFor(assertion: () => void | Promise<void>, { timeout = 3000, interval = 20 } = {}): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

interface StateChange {
  state: ConnectionState;
  error: { code: string; message: string } | null;
}

let server: RealtimeTestServer | undefined;
let sockets: RealtimeSocket[] = [];

afterEach(async () => {
  for (const s of sockets) s.close();
  sockets = [];
  await server?.close();
  server = undefined;
});

function makeHostSocket(wsBaseUrl: string, roomCode: string, hostSessionToken: string, states: StateChange[], envelopes: Array<{ type: string; payload: unknown }> = []) {
  const socket = new RealtimeSocket({
    wsBaseUrl,
    kind: 'host',
    roomCode,
    webSocketImpl: wsImpl,
    buildAuthMessage: () => ({ type: 'host:reconnect', payload: { hostSessionToken } }),
    onStateChange: (state, error) => states.push({ state, error }),
    onEnvelope: (type, payload) => envelopes.push({ type, payload }),
  });
  sockets.push(socket);
  return socket;
}

function makePlayerSocket(wsBaseUrl: string, roomCode: string, sessionToken: string, states: StateChange[], envelopes: Array<{ type: string; payload: unknown }> = []) {
  const socket = new RealtimeSocket({
    wsBaseUrl,
    kind: 'player',
    roomCode,
    webSocketImpl: wsImpl,
    buildAuthMessage: () => ({ type: 'player:reconnect', payload: { sessionToken } }),
    onStateChange: (state, error) => states.push({ state, error }),
    onEnvelope: (type, payload) => envelopes.push({ type, payload }),
  });
  sockets.push(socket);
  return socket;
}

describe('RealtimeSocket — host authentication', () => {
  it('1 & 2 & 5. connects and authenticates using the existing host:reconnect event as the first (and only auth) message', async () => {
    server = await startRealtimeTestServer(401);
    const room = await seedRoom(server);
    const states: StateChange[] = [];
    const envelopes: Array<{ type: string; payload: unknown }> = [];

    const socket = makeHostSocket(server.wsBaseUrl, room.roomCode, room.hostSessionToken, states, envelopes);
    socket.connect();

    await waitFor(() => expect(states.some((s) => s.state === 'connected')).toBe(true));
    expect(states.map((s) => s.state)).toContain('connecting');
    expect(states.map((s) => s.state)).toContain('authenticating');
    expect(envelopes.some((e) => e.type === 'view:tv')).toBe(true);
  });

  it('6. an invalid host session is rejected safely (unauthorized, no crash, Arabic message)', async () => {
    server = await startRealtimeTestServer(403);
    const room = await seedRoom(server);
    const states: StateChange[] = [];

    const socket = makeHostSocket(server.wsBaseUrl, room.roomCode, 'not-a-real-token', states);
    socket.connect();

    await waitFor(() => expect(states.some((s) => s.state === 'unauthorized')).toBe(true));
    const unauthorized = states.find((s) => s.state === 'unauthorized')!;
    expect(unauthorized.error?.message).toBe('انتهت الجلسة، انضم من جديد.');
  });

  it('13. the host connection never receives PrivatePlayerPayload', async () => {
    server = await startRealtimeTestServer(407);
    const room = await seedRoom(server, ['سارة']);
    const states: StateChange[] = [];
    const envelopes: Array<{ type: string; payload: unknown }> = [];

    makeHostSocket(server.wsBaseUrl, room.roomCode, room.hostSessionToken, states, envelopes).connect();

    await waitFor(() => expect(states.some((s) => s.state === 'connected')).toBe(true));
    expect(envelopes.some((e) => e.type === 'player:privateRoleInfo')).toBe(false);
  });
});

describe('RealtimeSocket — player authentication', () => {
  it('3 & 4. connects and authenticates an EXISTING (HTTP-registered) player using player:reconnect', async () => {
    server = await startRealtimeTestServer(411);
    const room = await seedRoom(server, ['سارة']);
    const player = room.players[0]!;
    const states: StateChange[] = [];
    const envelopes: Array<{ type: string; payload: unknown }> = [];

    makePlayerSocket(server.wsBaseUrl, room.roomCode, player.sessionToken, states, envelopes).connect();

    await waitFor(() => expect(states.some((s) => s.state === 'connected')).toBe(true));
    const view = envelopes.find((e) => e.type === 'view:player')?.payload as { playerId: string } | undefined;
    expect(view?.playerId).toBe(player.playerId);
  });

  it('7. an invalid player session is rejected safely (unauthorized, no crash)', async () => {
    server = await startRealtimeTestServer(413);
    const room = await seedRoom(server);
    const states: StateChange[] = [];

    makePlayerSocket(server.wsBaseUrl, room.roomCode, 'not-a-real-token', states).connect();

    await waitFor(() => expect(states.some((s) => s.state === 'unauthorized')).toBe(true));
  });

  it('8. connecting via WebSocket (player:reconnect) never creates a duplicate player', async () => {
    server = await startRealtimeTestServer(417);
    const room = await seedRoom(server, ['سارة']);
    const player = room.players[0]!;
    const states: StateChange[] = [];

    makePlayerSocket(server.wsBaseUrl, room.roomCode, player.sessionToken, states).connect();
    await waitFor(() => expect(states.some((s) => s.state === 'connected')).toBe(true));

    const persisted = await server.repos.roomStateRepo.load(room.roomId);
    expect(Object.keys(persisted!.players)).toHaveLength(1);
    expect(persisted!.players[player.playerId]).toBeDefined();
  });
});

describe('RealtimeSocket — live multi-client updates', () => {
  it('9 & 10. one, then multiple, connected players appear live in the TvView', async () => {
    server = await startRealtimeTestServer(421);
    const room = await seedRoom(server, ['سارة', 'أحمد']);
    // `seedRoom` persists players exactly as a real HTTP join does — `connectionStatus: 'connected'`
    // from the start (see `joinPlayer` in room-lifecycle.ts). To observe a genuine live
    // connected-count transition (rather than one that's already "connected" before any socket
    // exists), mark both as `disconnected` first, matching the real state right before a player's
    // browser opens its WebSocket.
    const seededRoom = await server.repos.roomStateRepo.load(room.roomId);
    for (const p of room.players) seededRoom!.players[p.playerId]!.connectionStatus = 'disconnected';
    await server.repos.roomStateRepo.save(seededRoom!);

    const hostStates: StateChange[] = [];
    const hostEnvelopes: Array<{ type: string; payload: unknown }> = [];
    makeHostSocket(server.wsBaseUrl, room.roomCode, room.hostSessionToken, hostStates, hostEnvelopes).connect();
    await waitFor(() => expect(hostStates.some((s) => s.state === 'connected')).toBe(true));

    const firstStates: StateChange[] = [];
    makePlayerSocket(server.wsBaseUrl, room.roomCode, room.players[0]!.sessionToken, firstStates).connect();
    await waitFor(() => expect(firstStates.some((s) => s.state === 'connected')).toBe(true));

    await waitFor(() => {
      const latestTv = [...hostEnvelopes].reverse().find((e) => e.type === 'view:tv')?.payload as { players: Array<{ connectionStatus: string }> } | undefined;
      expect(latestTv?.players.filter((p) => p.connectionStatus === 'connected')).toHaveLength(1);
    });

    const secondStates: StateChange[] = [];
    makePlayerSocket(server.wsBaseUrl, room.roomCode, room.players[1]!.sessionToken, secondStates).connect();
    await waitFor(() => expect(secondStates.some((s) => s.state === 'connected')).toBe(true));

    await waitFor(() => {
      const latestTv = [...hostEnvelopes].reverse().find((e) => e.type === 'view:tv')?.payload as { players: Array<{ connectionStatus: string }> } | undefined;
      expect(latestTv?.players.filter((p) => p.connectionStatus === 'connected')).toHaveLength(2);
    });
  });

  it('11 & 12. a player receives only their OWN personalized PlayerView and PrivatePlayerPayload', async () => {
    server = await startRealtimeTestServer(431);
    const room = await seedRoom(server, ['سارة', 'أحمد']);
    const [player1, player2] = room.players;

    const states1: StateChange[] = [];
    const envelopes1: Array<{ type: string; payload: unknown }> = [];
    makePlayerSocket(server.wsBaseUrl, room.roomCode, player1!.sessionToken, states1, envelopes1).connect();
    await waitFor(() => expect(states1.some((s) => s.state === 'connected')).toBe(true));

    const view1 = envelopes1.find((e) => e.type === 'view:player')?.payload as { playerId: string; self: { name: string } } | undefined;
    expect(view1?.playerId).toBe(player1!.playerId);
    expect(view1?.self.name).toBe('سارة');
    // Never the other player's identity as "self".
    expect(view1?.playerId).not.toBe(player2!.playerId);
  });

  it('14 & 15. player disconnect then reconnect restores the SAME player (never a new one), and resends the latest view', async () => {
    server = await startRealtimeTestServer(441);
    const room = await seedRoom(server, ['سارة']);
    const player = room.players[0]!;

    const states1: StateChange[] = [];
    const socket1 = makePlayerSocket(server.wsBaseUrl, room.roomCode, player.sessionToken, states1);
    socket1.connect();
    await waitFor(() => expect(states1.some((s) => s.state === 'connected')).toBe(true));

    socket1.close();
    await waitFor(async () => {
      const persisted = await server!.repos.roomStateRepo.load(room.roomId);
      expect(persisted!.players[player.playerId]!.connectionStatus).toBe('disconnected');
    });

    const states2: StateChange[] = [];
    const envelopes2: Array<{ type: string; payload: unknown }> = [];
    makePlayerSocket(server.wsBaseUrl, room.roomCode, player.sessionToken, states2, envelopes2).connect();
    await waitFor(() => expect(states2.some((s) => s.state === 'connected')).toBe(true));

    const view2 = envelopes2.find((e) => e.type === 'view:player')?.payload as { playerId: string } | undefined;
    expect(view2?.playerId).toBe(player.playerId);

    const persisted = await server.repos.roomStateRepo.load(room.roomId);
    expect(Object.keys(persisted!.players)).toHaveLength(1); // still exactly one player
    expect(persisted!.players[player.playerId]!.connectionStatus).toBe('connected');
  });

  it('16. a fresh RealtimeSocket re-authenticating with the same stored session (simulating a browser refresh) reconnects correctly', async () => {
    server = await startRealtimeTestServer(443);
    const room = await seedRoom(server, ['سارة']);
    const player = room.players[0]!;

    const firstStates: StateChange[] = [];
    const first = makePlayerSocket(server.wsBaseUrl, room.roomCode, player.sessionToken, firstStates);
    first.connect();
    await waitFor(() => expect(firstStates.some((s) => s.state === 'connected')).toBe(true));
    first.close(); // simulates the tab closing/navigating away on refresh

    // A brand-new RealtimeSocket instance, exactly what a fresh page load creates, using the SAME
    // sessionStorage-restored token.
    const refreshedStates: StateChange[] = [];
    makePlayerSocket(server.wsBaseUrl, room.roomCode, player.sessionToken, refreshedStates).connect();
    await waitFor(() => expect(refreshedStates.some((s) => s.state === 'connected')).toBe(true));
  });
});

describe('RealtimeSocket — duplicate connections and manual retry', () => {
  it('17. a second connection for the same host session replaces the first, which becomes disconnected (not stuck reconnecting)', async () => {
    server = await startRealtimeTestServer(451);
    const room = await seedRoom(server);

    const states1: StateChange[] = [];
    const socket1 = makeHostSocket(server.wsBaseUrl, room.roomCode, room.hostSessionToken, states1);
    socket1.connect();
    await waitFor(() => expect(states1.some((s) => s.state === 'connected')).toBe(true));

    const states2: StateChange[] = [];
    const socket2 = makeHostSocket(server.wsBaseUrl, room.roomCode, room.hostSessionToken, states2);
    socket2.connect();
    await waitFor(() => expect(states2.some((s) => s.state === 'connected')).toBe(true));

    await waitFor(() => expect(states1.some((s) => s.state === 'disconnected')).toBe(true));
    const replaced = states1.find((s) => s.state === 'disconnected')!;
    expect(replaced.error?.code).toBe('SESSION_REPLACED');
  });

  it('21 & 22. after an unauthorized rejection, automatic reconnect stays stopped until a manual retry() is called', async () => {
    server = await startRealtimeTestServer(457);
    const room = await seedRoom(server);
    const states: StateChange[] = [];

    const socket = makeHostSocket(server.wsBaseUrl, room.roomCode, 'still-not-a-real-token', states);
    socket.connect();
    await waitFor(() => expect(states.some((s) => s.state === 'unauthorized')).toBe(true));

    const countAfterUnauthorized = states.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(states.length).toBe(countAfterUnauthorized); // nothing happened automatically — no silent reconnect loop

    socket.retry();
    await waitFor(() => expect(states.some((s, i) => i > countAfterUnauthorized - 1 && s.state === 'connecting')).toBe(true));
  });
});
