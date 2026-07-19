import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, sendHost, sendPlayer, setupRoom, startGame } from './helpers/room.js';
import { handleEvent } from '../src/fsm/transitions.js';

describe('Event validation', () => {
  it('24a. an event carrying a stale phaseId is rejected and the room is unchanged', () => {
    const deps = createTestDeps(139);
    const setup = setupRoom(5, deps);
    const started = startGame(setup.room, setup.priv, deps);
    const staleId = started.room.phase.phaseId; // the ROLE_REVEAL phaseId

    // Have everyone acknowledge, which genuinely advances the phase (ROLE_REVEAL -> GAME_INTRO),
    // so `staleId` now belongs to a phase that's no longer current.
    const advanced = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    expect(advanced.room.phase.state).toBe('GAME_INTRO');
    expect(advanced.room.phase.phaseId).not.toBe(staleId);

    const stale = sendHost(advanced.room, advanced.priv, { type: 'host:skipIntro', phaseId: staleId }, deps);

    expect(stale.rejected?.code).toBe('STALE_PHASE');
    expect(stale.room.phase.phaseId).toBe(advanced.room.phase.phaseId); // unchanged
    expect(stale.room.phase.state).toBe('GAME_INTRO'); // did NOT advance to MINIGAME_SELECT
  });

  it('24b. an event invalid for the current state is rejected', () => {
    const deps = createTestDeps(149);
    const setup = setupRoom(5, deps); // still in LOBBY

    const result = sendPlayer(setup.room, setup.priv, { type: 'player:submitVote', phaseId: setup.room.phase.phaseId, playerId: setup.playerIds[0]!, targetPlayerId: 'skip' }, setup.playerIds[0]!, deps);

    expect(result.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
    expect(result.room.phase.state).toBe('LOBBY');
  });

  it('a host-shaped event from a player sender is rejected as NOT_HOST', () => {
    const deps = createTestDeps(151);
    const setup = setupRoom(5, deps);

    const result = handleEvent(setup.room, setup.priv, { type: 'host:startGame', phaseId: setup.room.phase.phaseId }, { kind: 'player', playerId: setup.playerIds[0]! }, deps);

    expect(result.rejected?.code).toBe('NOT_HOST');
    expect(result.room.phase.state).toBe('LOBBY');
  });

  it('a player event whose payload playerId does not match the authenticated sender is rejected', () => {
    const deps = createTestDeps(157);
    const setup = setupRoom(5, deps);
    const started = startGame(setup.room, setup.priv, deps);
    const [victim, impersonator] = setup.playerIds as [string, string];

    const result = handleEvent(
      started.room,
      started.priv,
      { type: 'player:acknowledgeReveal', phaseId: started.room.phase.phaseId, playerId: victim },
      { kind: 'player', playerId: impersonator },
      deps,
    );

    expect(result.rejected?.code).toBe('IDENTITY_MISMATCH');
  });

  it('host:closeRoom is valid from (almost) any state and moves the room to ABANDONED', () => {
    const deps = createTestDeps(163);
    const setup = setupRoom(5, deps);
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);

    const closed = sendHost(acked.room, acked.priv, { type: 'host:closeRoom' }, deps);

    expect(closed.room.phase.state).toBe('ABANDONED');
  });
});
