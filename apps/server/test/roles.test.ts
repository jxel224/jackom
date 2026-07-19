import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, setupRoom, startGame } from './helpers/room.js';
import { handleEvent } from '../src/fsm/transitions.js';

describe('Role assignment stays private', () => {
  it('5. roles are never present anywhere on the public RoomState', () => {
    const deps = createTestDeps();
    const setup = setupRoom(6, deps);
    const { room, priv } = startGame(setup.room, setup.priv, deps);

    // RoomState (the public/persistence document) must not have a role field anywhere reachable
    // from `players` — role only exists in RoomPrivateState.
    for (const player of Object.values(room.players)) {
      expect((player as unknown as Record<string, unknown>).role).toBeUndefined();
    }
    const serializedRoom = JSON.stringify(room);
    expect(serializedRoom).not.toContain('HACKER');
    expect(serializedRoom).not.toContain('CREW');

    // Meanwhile priv genuinely has the roles.
    const roles = setup.playerIds.map((id) => priv.players[id]?.role);
    expect(roles.every((r) => r === 'CREW' || r === 'HACKER')).toBe(true);
    expect(roles.some((r) => r === 'HACKER')).toBe(true);
  });
});

describe('Role reveal', () => {
  it('6a. advances to GAME_INTRO once every connected player acknowledges', () => {
    const deps = createTestDeps();
    const setup = setupRoom(5, deps);
    const started = startGame(setup.room, setup.priv, deps);
    expect(started.room.phase.state).toBe('ROLE_REVEAL');

    // Acknowledging fewer than all players must not advance the phase yet.
    const partial = handleEvent(
      started.room,
      started.priv,
      { type: 'player:acknowledgeReveal', phaseId: started.room.phase.phaseId, playerId: setup.playerIds[0]! },
      { kind: 'player', playerId: setup.playerIds[0]! },
      deps,
    );
    expect(partial.room.phase.state).toBe('ROLE_REVEAL');

    const allAcked = ackAllReveals(partial.room, partial.priv, setup.playerIds.slice(1), deps);
    expect(allAcked.room.phase.state).toBe('GAME_INTRO');
  });

  it('6b. a timeout advances to GAME_INTRO even if nobody acknowledged', () => {
    const deps = createTestDeps();
    const setup = setupRoom(5, deps);
    const started = startGame(setup.room, setup.priv, deps);

    const timedOut = expireTimer(started.room, started.priv, deps);

    expect(timedOut.room.phase.state).toBe('GAME_INTRO');
  });

  it('6c. a disconnected player is excluded from the "everyone acknowledged" check', () => {
    const deps = createTestDeps();
    const setup = setupRoom(5, deps);
    const started = startGame(setup.room, setup.priv, deps);

    const disconnected = handleEvent(
      started.room,
      started.priv,
      { type: 'player:disconnected', playerId: setup.playerIds[0]! },
      { kind: 'host' },
      deps,
    );
    expect(disconnected.room.players[setup.playerIds[0]!]?.connectionStatus).toBe('disconnected');

    const allOthersAcked = ackAllReveals(disconnected.room, disconnected.priv, setup.playerIds.slice(1), deps);
    expect(allOthersAcked.room.phase.state).toBe('GAME_INTRO');
  });
});
