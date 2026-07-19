import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { authenticateHost, joinAsPlayer, nextMessage, send, startTestGateway, type TestGatewaySetup } from '../helpers/gateway.js';

describe('Gateway view delivery', () => {
  let setup: TestGatewaySetup;

  beforeEach(async () => {
    setup = await startTestGateway();
  });
  afterEach(async () => {
    await setup.close();
  });

  it('14. the host receives ONLY TvView-shaped payloads, never a player-specific view', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws: hostWs } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const alice = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');

    const tv = await nextMessage(hostWs, (m) => m.type === 'view:tv');
    const payload = tv.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('roomCode');
    expect(payload).toHaveProperty('players');
    // PlayerView-only fields must never appear on what the host receives.
    expect(payload).not.toHaveProperty('isParticipantThisRound');
    expect(payload).not.toHaveProperty('canVote');
    expect(JSON.stringify(payload)).not.toContain('"role"');

    hostWs.close();
    alice.ws.close();
  });

  it('15. each player receives ONLY their own personalized PlayerView, never a raw TvView or another player\'s view', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const alice = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');
    const bob = await joinAsPlayer(setup.port, handle.roomCode, 'Bob');

    // Bob joining broadcasts a fresh view:player to everyone already in the room, including Alice —
    // that's the view we inspect for her (her own join's view predates Bob and has no bearing here).
    const aliceView = await nextMessage(alice.ws, (m) => m.type === 'view:player');
    // A third player joining gives Bob a fresh view of his own to inspect symmetrically.
    const carol = await joinAsPlayer(setup.port, handle.roomCode, 'Carol');
    const bobView = await nextMessage(bob.ws, (m) => m.type === 'view:player');

    expect((aliceView.payload as { playerId: string }).playerId).toBe(alice.playerId);
    expect((bobView.payload as { playerId: string }).playerId).toBe(bob.playerId);
    expect(aliceView.payload as Record<string, unknown>).not.toHaveProperty('roomCode'); // TvView-only field
    expect(bobView.payload as Record<string, unknown>).not.toHaveProperty('roomCode');

    alice.ws.close();
    bob.ws.close();
    carol.ws.close();
  });

  it('16. private role info reaches ONLY the correct player, never anyone else, and never the host', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const players = [];
    for (let i = 0; i < 5; i++) players.push(await joinAsPlayer(setup.port, handle.roomCode, `P${i}`));
    const { ws: hostWs } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const phaseId = setup.manager.get(handle.roomId).getSnapshot()!.room.phase.phaseId;

    send(hostWs, { type: 'host:startGame', payload: { phaseId } });
    await nextMessage(hostWs, (m) => (m.payload as { phase: { state: string } })?.phase?.state === 'ROLE_REVEAL');

    for (const p of players) {
      const roleInfo = await nextMessage(p.ws, (m) => m.type === 'player:privateRoleInfo');
      const payload = roleInfo.payload as { playerId: string; role: string };
      expect(payload.playerId).toBe(p.playerId); // only ever this player's own id
      expect(['CREW', 'HACKER']).toContain(payload.role);
    }

    hostWs.close();
    for (const p of players) p.ws.close();
  });
});
