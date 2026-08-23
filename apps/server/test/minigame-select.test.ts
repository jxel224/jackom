import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, setupRoom, startGame } from './helpers/room.js';

describe('Mini-game selection', () => {
  it('7. selecting a mini-game (via the Admin-selection timeout fallback) creates currentRound with the expected shape', () => {
    const deps = createTestDeps();
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });

    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    expect(acked.room.phase.state).toBe('GAME_INTRO');

    // GAME_INTRO -> MINIGAME_SELECT (the Admin's real, waiting selection window since Core Logic
    // Phase 1 — see GAMEPLAY_RULES_V1.md §4/§5) -> HACKER_CORRUPTION once its own timeout fires
    // and the server auto-selects on the Admin's behalf.
    const afterIntro = expireTimer(acked.room, acked.priv, deps);
    expect(afterIntro.room.phase.state).toBe('MINIGAME_SELECT');
    expect(afterIntro.room.adminId).not.toBeNull();
    expect(afterIntro.room.adminQueue).not.toContain(afterIntro.room.adminId);

    const afterSelection = expireTimer(afterIntro.room, afterIntro.priv, deps);

    expect(afterSelection.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(afterSelection.room.currentRound).not.toBeNull();
    expect(afterSelection.room.currentRound?.minigameId).toBe('RANK_IT');
    expect(afterSelection.room.currentRound?.roundInCycle).toBe(1);
    expect(afterSelection.room.currentRound?.adminId).toBe(afterIntro.room.adminId);
    expect(afterSelection.room.currentRound?.participantIds.length).toBeGreaterThan(0);
    expect(afterSelection.room.currentRound?.hackedPlayerIds).toEqual([]);
    expect(afterSelection.room.currentRound?.moduleState).toBeNull(); // module.start() only runs once the hack window resolves
  });
});
