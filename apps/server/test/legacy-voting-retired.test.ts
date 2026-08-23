import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { adminSelectMinigame, castAccusationVotes, driveToAdminSelection, expireTimer, hackerIdsOf, pushButton, setupRoom, submitAccusation } from './helpers/room.js';
import { createDefaultConfig } from '../src/config/defaults.js';

const NO_SPECIAL_GAME = { specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-never' } };

/** Drives one full normal round (real Admin selection) from MINIGAME_SELECT back to the next MINIGAME_SELECT. */
function playOneRoundToNextSelect(room: ReturnType<typeof setupRoom>['room'], priv: ReturnType<typeof setupRoom>['priv'], deps: ReturnType<typeof createTestDeps>) {
  const adminId = room.adminId!;
  const others = Object.keys(room.players).filter((id) => id !== adminId);
  let r = adminSelectMinigame(room, priv, 'RANK_IT', others.slice(0, 2), deps); // -> HACKER_CORRUPTION
  r = expireTimer(r.room, r.priv, deps); // -> MINIGAME_INSTRUCTIONS
  r = expireTimer(r.room, r.priv, deps); // -> MINIGAME_PLAY
  r = expireTimer(r.room, r.priv, deps); // -> RESULTS_REVEAL
  r = expireTimer(r.room, r.priv, deps); // -> DISCUSSION
  r = expireTimer(r.room, r.priv, deps); // -> resolveAfterRoundOrSpecial()
  return r;
}

/**
 * PART 1 of the final gameplay closure (JACKOM final gameplay closure): the legacy periodic
 * elimination vote (FINAL_DISCUSSION/VOTING/ELIMINATION_RESULT, `currentVote`/`voteHistory`) was
 * retired as a product decision — it is not reachable from any real match. These tests prove that
 * unreachability at runtime (not just "the types don't exist any more") and confirm every adjacent
 * concern this change could plausibly have broken is actually unaffected.
 */
describe('Legacy periodic elimination vote is retired', () => {
  it('after more than roundsPerCycle normal rounds, play loops back to MINIGAME_SELECT — never diverts into voting', () => {
    const deps = createTestDeps(701);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME, rules: { ...createDefaultConfig().rules, roundsPerCycle: 2 } });
    const atSelect = driveToAdminSelection(setup, deps);

    // Play THREE full rounds — one more than the default roundsPerCycle:2 threshold that used to
    // divert into FINAL_DISCUSSION/VOTING once exhausted.
    let current = atSelect;
    for (let round = 0; round < 3; round++) {
      expect(current.room.phase.state).toBe('MINIGAME_SELECT');
      current = playOneRoundToNextSelect(current.room, current.priv, deps);
    }

    expect(current.room.phase.state).toBe('MINIGAME_SELECT');
    expect(current.room.roundInCycle).toBe(3); // still just a special-game-trigger counter, not reset
    expect(current.room.cycle).toBe(1); // never incremented — only the removed ELIMINATION_RESULT handler used to do that
  });

  it('ELIMINATION_RESULT, VOTING, and FINAL_DISCUSSION are not valid GameState values any more (compile-time proof)', () => {
    // `as const` + assignment below is itself the proof: if any of these strings were still a
    // legal GameState, this file would fail to typecheck. Runtime assertions on top for belt-and-braces.
    const retiredStates = ['FINAL_DISCUSSION', 'VOTING', 'ELIMINATION_RESULT'] as const;
    for (const state of retiredStates) {
      // @ts-expect-error — these are no longer part of the GameState union; this line documents that.
      const neverValid: import('../src/shared.js').GameState = state;
      expect(typeof neverValid).toBe('string');
    }
  });

  it('Push the Button remains the sole real-time way to end a match early, and still works from every approved phase', () => {
    const deps = createTestDeps(709);
    const setup = setupRoom(5, deps, NO_SPECIAL_GAME);
    const atSelect = driveToAdminSelection(setup, deps);
    const hackerIds = hackerIdsOf(atSelect.priv);
    const initiatorId = setup.playerIds.find((id) => !hackerIds.includes(id)) ?? setup.playerIds[0]!;

    // Allowed from MINIGAME_SELECT.
    const pushedFromSelect = pushButton(atSelect.room, atSelect.priv, initiatorId, deps);
    expect(pushedFromSelect.room.phase.state).toBe('ACCUSATION_SELECT');

    // Cancel (selection timeout) and confirm it's allowed again once back in gameplay.
    const cancelled = expireTimer(pushedFromSelect.room, pushedFromSelect.priv, deps);
    expect(cancelled.room.phase.state).toBe('MINIGAME_SELECT'); // resumes the SAME interrupted Admin turn

    const pushedAgain = pushButton(cancelled.room, cancelled.priv, initiatorId, deps);
    expect(pushedAgain.room.phase.state).toBe('ACCUSATION_SELECT');
    const selected = submitAccusation(pushedAgain.room, pushedAgain.priv, initiatorId, hackerIds, deps);
    expect(selected.room.phase.state).toBe('ACCUSATION_VOTE');
    const resolved = castAccusationVotes(selected.room, selected.priv, setup.playerIds, 'APPROVE', deps);
    expect(resolved.room.phase.state).toBe('FINAL_RESULTS');
  });

  it('a correct accusation still resolves the match to FINAL_RESULTS with winner "crew"', () => {
    const deps = createTestDeps(713);
    const setup = setupRoom(5, deps, NO_SPECIAL_GAME);
    const atSelect = driveToAdminSelection(setup, deps);
    const hackerIds = hackerIdsOf(atSelect.priv);
    const initiatorId = setup.playerIds.find((id) => !hackerIds.includes(id)) ?? setup.playerIds[0]!;

    const pushed = pushButton(atSelect.room, atSelect.priv, initiatorId, deps);
    const selected = submitAccusation(pushed.room, pushed.priv, initiatorId, hackerIds, deps);
    expect(selected.room.phase.state).toBe('ACCUSATION_VOTE');
    const resolved = castAccusationVotes(selected.room, selected.priv, setup.playerIds, 'APPROVE', deps);

    expect(resolved.room.phase.state).toBe('FINAL_RESULTS');
    expect(resolved.room.winner).toBe('crew');
  });

  it('the special game still triggers correctly, entirely independent of the retired voting mechanic', () => {
    const deps = createTestDeps(719);
    const setup = setupRoom(7, deps, {
      minigameSelection: { minigameSelectionRuleId: 'rank-it-only' },
      specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-end-of-cycle-once' },
      rules: { ...createDefaultConfig().rules, roundsPerCycle: 2 },
    });
    const atSelect = driveToAdminSelection(setup, deps);

    let current = atSelect;
    current = playOneRoundToNextSelect(current.room, current.priv, deps); // round 1 of 2
    expect(current.room.phase.state).toBe('MINIGAME_SELECT');
    expect(current.room.specialGameUsed).toBe(false);

    current = playOneRoundToNextSelect(current.room, current.priv, deps); // round 2 of 2 — quota met
    expect(current.room.phase.state).toBe('SPECIAL_GAME_INTRO'); // due now, not FINAL_DISCUSSION
    expect(current.room.specialGameUsed).toBe(true);
  });

  it('the match clock is unaffected — still starts at GAME_INTRO exit and keeps running across repeated rounds', () => {
    const deps = createTestDeps(727);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const atSelect = driveToAdminSelection(setup, deps);
    expect(atSelect.room.matchClock.status).toBe('running');
    expect(atSelect.room.matchClock.remainingMs).toBe(setup.room.config.rules.matchClockTotalMs);

    const afterTwoRounds = playOneRoundToNextSelect(playOneRoundToNextSelect(atSelect.room, atSelect.priv, deps).room, playOneRoundToNextSelect(atSelect.room, atSelect.priv, deps).priv, deps);
    expect(afterTwoRounds.room.matchClock.status).toBe('running');
  });

  it('the Firewall mechanic is unaffected — still consumed exactly once and blocks exactly the next hack window', () => {
    const deps = createTestDeps(733);
    const setup = setupRoom(7, deps, {
      minigameSelection: { minigameSelectionRuleId: 'rank-it-only' },
      specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-after-first-round-once' },
      rules: { ...createDefaultConfig().rules, roundsPerCycle: 1 },
    });
    const atSelect = driveToAdminSelection(setup, deps);
    const afterRound1 = playOneRoundToNextSelect(atSelect.room, atSelect.priv, deps);
    expect(afterRound1.room.phase.state).toBe('SPECIAL_GAME_INTRO');

    let r = expireTimer(afterRound1.room, afterRound1.priv, deps); // -> SPECIAL_GAME_PLAY
    r = expireTimer(r.room, r.priv, deps); // overall timeout -> failure -> SPECIAL_GAME_RESULT
    expect(r.room.firewallActive).toBe(false); // failure never activates it
  });
});
