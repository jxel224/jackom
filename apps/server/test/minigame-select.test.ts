import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, setupRoom, startGame } from './helpers/room.js';

describe('Mini-game selection', () => {
  it('7. selecting a mini-game creates currentRound with the expected shape', () => {
    const deps = createTestDeps();
    const setup = setupRoom(6, deps);

    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    expect(acked.room.phase.state).toBe('GAME_INTRO');

    // GAME_INTRO -> MINIGAME_SELECT -> HACKER_CORRUPTION, both instantaneous.
    const afterIntro = expireTimer(acked.room, acked.priv, deps);

    expect(afterIntro.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(afterIntro.room.currentRound).not.toBeNull();
    expect(afterIntro.room.currentRound?.minigameId).toBe('generic-placeholder');
    expect(afterIntro.room.currentRound?.roundInCycle).toBe(1);
    expect(afterIntro.room.currentRound?.participantIds.length).toBeGreaterThan(0);
    expect(afterIntro.room.currentRound?.corrupted).toBe(false);
    expect(afterIntro.room.currentRound?.moduleState).toBeNull(); // module.start() only runs once corruption resolves
  });
});
