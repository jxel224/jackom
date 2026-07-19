import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/config/defaults.js';
import {
  authenticateHost,
  connectClient,
  joinAsPlayer,
  nextMessage,
  send,
  startTestGateway,
  waitForClose,
  waitForOpen,
  type TestGatewaySetup,
} from '../helpers/gateway.js';

describe('Gateway reconnection', () => {
  let setup: TestGatewaySetup;

  beforeEach(async () => {
    setup = await startTestGateway();
  });
  afterEach(async () => {
    await setup.close();
  });

  it('17. a reconnecting player immediately receives the current view', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const alice = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');
    alice.ws.close();
    await new Promise((r) => setTimeout(r, 50));

    const ws2 = connectClient(setup.port, 'player', handle.roomCode);
    await waitForOpen(ws2);
    send(ws2, { type: 'player:reconnect', payload: { sessionToken: alice.sessionToken } });
    await nextMessage(ws2, (m) => m.type === 'player:reconnected');
    const view = await nextMessage(ws2, (m) => m.type === 'view:player');
    expect((view.payload as { playerId: string }).playerId).toBe(alice.playerId);

    ws2.close();
  });

  it('17b. a reconnecting player after role assignment is re-sent their private role info', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const players = [];
    for (let i = 0; i < 5; i++) players.push(await joinAsPlayer(setup.port, handle.roomCode, `P${i}`));
    const { ws: hostWs } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const phaseId = setup.manager.get(handle.roomId).getSnapshot()!.room.phase.phaseId;
    send(hostWs, { type: 'host:startGame', payload: { phaseId } });
    await nextMessage(hostWs, (m) => (m.payload as { phase: { state: string } })?.phase?.state === 'ROLE_REVEAL');

    const alice = players[0]!;
    await nextMessage(alice.ws, (m) => m.type === 'player:privateRoleInfo'); // first delivery
    alice.ws.close();
    await new Promise((r) => setTimeout(r, 50));

    const ws2 = connectClient(setup.port, 'player', handle.roomCode);
    await waitForOpen(ws2);
    send(ws2, { type: 'player:reconnect', payload: { sessionToken: alice.sessionToken } });
    await nextMessage(ws2, (m) => m.type === 'player:reconnected');
    const roleInfo = await nextMessage(ws2, (m) => m.type === 'player:privateRoleInfo');
    expect((roleInfo.payload as { playerId: string }).playerId).toBe(alice.playerId);

    ws2.close();
    for (const p of players.slice(1)) p.ws.close();
    hostWs.close();
  });

  it('18. reconnecting never creates a duplicate player — the roster size is unchanged', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const alice = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');
    const before = setup.manager.get(handle.roomId).getSnapshot();
    const countBefore = Object.keys(before!.room.players).length;

    alice.ws.close();
    await new Promise((r) => setTimeout(r, 50));

    const ws2 = connectClient(setup.port, 'player', handle.roomCode);
    await waitForOpen(ws2);
    send(ws2, { type: 'player:reconnect', payload: { sessionToken: alice.sessionToken } });
    await nextMessage(ws2, (m) => m.type === 'player:reconnected');

    const after = setup.manager.get(handle.roomId).getSnapshot();
    expect(Object.keys(after!.room.players).length).toBe(countBefore);
    expect(after!.room.players[alice.playerId]).toBeDefined();

    ws2.close();
  });

  it('19. a duplicate socket for the same session is closed consistently, replaced by the newer one', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const alice = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');

    // A SECOND socket reconnects with the SAME session token while the first is still open.
    const ws2 = connectClient(setup.port, 'player', handle.roomCode);
    await waitForOpen(ws2);
    const closeInfoPromise = waitForClose(alice.ws);
    send(ws2, { type: 'player:reconnect', payload: { sessionToken: alice.sessionToken } });
    await nextMessage(ws2, (m) => m.type === 'player:reconnected');

    const closeInfo = await closeInfoPromise;
    expect(closeInfo.code).toBe(4000);

    ws2.close();
  });

  it('a host reconnecting also replaces the previous host socket', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const first = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    const closeInfoPromise = waitForClose(first.ws);
    const second = connectClient(setup.port, 'host', handle.roomCode);
    await waitForOpen(second);
    send(second, { type: 'host:reconnect', payload: { hostSessionToken: handle.hostSessionToken } });
    await nextMessage(second, (m) => m.type === 'host:authenticated');

    const closeInfo = await closeInfoPromise;
    expect(closeInfo.code).toBe(4000);
    second.close();
  });
});
