import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { authenticateHost, joinAsPlayer, nextMessage, send, startTestGateway, type TestGatewaySetup } from '../helpers/gateway.js';

async function joinN(port: number, roomCode: string, n: number) {
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push(await joinAsPlayer(port, roomCode, `Player${i}`));
  }
  return players;
}

describe('Gateway event dispatch', () => {
  let setup: TestGatewaySetup;

  beforeEach(async () => {
    setup = await startTestGateway();
  });
  afterEach(async () => {
    await setup.close();
  });

  it('11. a valid event reaches the correct RoomActor and actually changes state', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const players = await joinN(setup.port, handle.roomCode, 5);
    const { ws: hostWs } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const phaseId = setup.manager.get(handle.roomId).getSnapshot()!.room.phase.phaseId;

    send(hostWs, { type: 'host:startGame', payload: { phaseId } });
    const tv = await nextMessage(hostWs, (m) => (m.payload as { phase: { state: string } })?.phase?.state === 'ROLE_REVEAL');
    expect((tv.payload as { phase: { state: string } }).phase.state).toBe('ROLE_REVEAL');

    const snapshot = setup.manager.get(handle.roomId).getSnapshot();
    expect(snapshot?.room.phase.state).toBe('ROLE_REVEAL');

    hostWs.close();
    for (const p of players) p.ws.close();
  });

  it('12. a rejected FSM event returns a typed WebSocket error, matching the requestId', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    // Only 2 players join — below the default minPlayers of 5.
    const players = await joinN(setup.port, handle.roomCode, 2);
    const { ws: hostWs } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const phaseId = setup.manager.get(handle.roomId).getSnapshot()!.room.phase.phaseId;

    send(hostWs, { type: 'host:startGame', requestId: 'req-42', payload: { phaseId } });
    const err = await nextMessage(hostWs, (m) => m.type === 'error:actionRejected');
    expect(err.requestId).toBe('req-42');
    expect((err.payload as { code: string }).code).toBe('INVALID_PLAYER_COUNT');

    hostWs.close();
    for (const p of players) p.ws.close();
  });

  it('13. an accepted event broadcasts updated views to the host AND every connected player', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const players = await joinN(setup.port, handle.roomCode, 5);
    const { ws: hostWs } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const phaseId = setup.manager.get(handle.roomId).getSnapshot()!.room.phase.phaseId;

    send(hostWs, { type: 'host:startGame', payload: { phaseId } });

    const tv = await nextMessage(hostWs, (m) => (m.payload as { phase: { state: string } })?.phase?.state === 'ROLE_REVEAL');
    expect((tv.payload as { phase: { state: string } }).phase.state).toBe('ROLE_REVEAL');

    for (const p of players) {
      const view = await nextMessage(p.ws, (m) => m.type === 'view:player' && (m.payload as { phase: { state: string } }).phase.state === 'ROLE_REVEAL');
      expect((view.payload as { phase: { state: string } }).phase.state).toBe('ROLE_REVEAL');
      // Everyone should also receive their private role info once roles exist.
      const roleInfo = await nextMessage(p.ws, (m) => m.type === 'player:privateRoleInfo');
      expect((roleInfo.payload as { playerId: string }).playerId).toBe(p.playerId);
    }

    hostWs.close();
    for (const p of players) p.ws.close();
  });
});
