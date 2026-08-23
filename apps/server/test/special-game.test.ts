import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, sendHost, setupRoom, startGame } from './helpers/room.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import type { HandleEventResult } from '../src/fsm/result.js';
import type { Deps } from '../src/types/deps.js';
import type { RoomConfig } from '../src/shared.js';

/** Drives exactly one regular round from HACKER_CORRUPTION through to DISCUSSION's resolution. */
function advanceOneRegularRoundAndResolve(prev: HandleEventResult, deps: Deps): HandleEventResult {
  let r = prev;
  expect(r.room.phase.state).toBe('HACKER_CORRUPTION');
  r = expireTimer(r.room, r.priv, deps); // -> MINIGAME_INSTRUCTIONS
  r = expireTimer(r.room, r.priv, deps); // -> MINIGAME_PLAY
  r = expireTimer(r.room, r.priv, deps); // -> RESULTS_REVEAL (timeout, generic module still "succeeds")
  r = expireTimer(r.room, r.priv, deps); // -> DISCUSSION
  r = expireTimer(r.room, r.priv, deps); // -> resolveAfterRoundOrSpecial decision
  return r;
}

function reachFirstHackerCorruption(playerCount: number, deps: Deps, overrides: Partial<RoomConfig> = {}) {
  const setup = setupRoom(playerCount, deps, {
    minigameSelection: { minigameSelectionRuleId: 'rank-it-only' },
    ...overrides,
  });
  const started = startGame(setup.room, setup.priv, deps);
  const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
  const afterIntro = expireTimer(acked.room, acked.priv, deps); // GAME_INTRO -> MINIGAME_SELECT (match clock starts here)
  const atCorruption = expireTimer(afterIntro.room, afterIntro.priv, deps); // Admin selection timeout -> HACKER_CORRUPTION
  return { setup, atCorruption };
}

describe('Special-game scheduling', () => {
  it('16a. can trigger BETWEEN regular rounds via a schedule rule keyed off round count', () => {
    const deps = createTestDeps(43);
    const { atCorruption } = reachFirstHackerCorruption(7, deps, {
      specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-after-first-round-once', insertionPoint: 'between_rounds' },
      rules: { ...createDefaultConfig().rules, roundsPerCycle: 2 },
    });

    const afterRound1 = advanceOneRegularRoundAndResolve(atCorruption, deps);

    // Only 1 of 2 roundsPerCycle has been played, yet the special game is due anyway.
    expect(afterRound1.room.phase.state).toBe('SPECIAL_GAME_INTRO');
    expect(afterRound1.room.specialGameUsed).toBe(true);
    expect(afterRound1.room.roundInCycle).toBe(1);
  });

  it('16b. can trigger only at the END of a cycle via a different schedule rule', () => {
    const deps = createTestDeps(47);
    const { atCorruption } = reachFirstHackerCorruption(7, deps, {
      specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-end-of-cycle-once', insertionPoint: 'end_of_cycle' },
      rules: { ...createDefaultConfig().rules, roundsPerCycle: 2 },
    });

    const afterRound1 = advanceOneRegularRoundAndResolve(atCorruption, deps);
    // Not due yet — only 1 of 2 rounds played this cycle. Lands on the Admin's real selection
    // window for round 2 (GAMEPLAY_RULES_V1.md §4), not directly on HACKER_CORRUPTION anymore.
    expect(afterRound1.room.phase.state).toBe('MINIGAME_SELECT');
    expect(afterRound1.room.specialGameUsed).toBe(false);
    const round2AtCorruption = expireTimer(afterRound1.room, afterRound1.priv, deps); // Admin selection timeout -> HACKER_CORRUPTION

    const afterRound2 = advanceOneRegularRoundAndResolve(round2AtCorruption, deps);
    // Now due — the cycle's round quota is met.
    expect(afterRound2.room.phase.state).toBe('SPECIAL_GAME_INTRO');
    expect(afterRound2.room.specialGameUsed).toBe(true);
  });
});

describe('Special-game consequences', () => {
  function reachSpecialGameResult(deps: Deps) {
    // roundsPerCycle: 1 so the special game triggers on schedule after exactly one regular round —
    // not because of any interaction with the (retired) legacy voting mechanic. Firewall-
    // consumption-on-the-next-round is covered by the dedicated Firewall test in corruption.test.ts (#8).
    const { atCorruption } = reachFirstHackerCorruption(7, deps, {
      specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-after-first-round-once' },
      rules: { ...createDefaultConfig().rules, roundsPerCycle: 1 },
    });
    const afterRound1 = advanceOneRegularRoundAndResolve(atCorruption, deps);
    expect(afterRound1.room.phase.state).toBe('SPECIAL_GAME_INTRO');

    let r = expireTimer(afterRound1.room, afterRound1.priv, deps); // -> SPECIAL_GAME_PLAY
    expect(r.room.phase.state).toBe('SPECIAL_GAME_PLAY');
    r = expireTimer(r.room, r.priv, deps); // Bomb Protocol overall timeout -> failure -> SPECIAL_GAME_RESULT
    expect(r.room.phase.state).toBe('SPECIAL_GAME_RESULT');
    return r;
  }

  it('17. success activates the Firewall and resumes the match clock unchanged', () => {
    const deps = createTestDeps(53);
    const result = reachSpecialGameResult(deps);
    expect(result.room.matchClock.status).toBe('paused'); // GAMEPLAY_RULES_V1.md §2 — paused for the whole special-game sequence
    const remainingBefore = result.room.matchClock.remainingMs;

    // The placeholder module always resolves as a failure; to exercise the FSM's OWN success-path
    // consequence logic (independent of any concrete special-game's mechanics, which don't exist
    // yet), we flip the just-recorded historical result to success — a legitimate way to test the
    // state machine's reaction to a module outcome without needing a real special game implemented.
    const flipped = structuredClone(result.room);
    flipped.specialRoundHistory[flipped.specialRoundHistory.length - 1]!.success = true;

    const resolved = sendHost(flipped, result.priv, { type: 'host:advance', phaseId: flipped.phase.phaseId }, deps);

    expect(resolved.room.firewallActive).toBe(true);
    expect(resolved.room.matchLog.some((e) => e.type === 'firewall_activated')).toBe(true);
    expect(resolved.room.matchClock.status).toBe('running');
    expect(resolved.room.matchClock.remainingMs).toBe(remainingBefore); // success never changes remaining time
  });

  it('18. failure subtracts exactly 180_000ms from the match clock and resumes', () => {
    const deps = createTestDeps(59);
    const result = reachSpecialGameResult(deps);
    expect(result.room.matchClock.status).toBe('paused');
    const remainingBefore = result.room.matchClock.remainingMs;
    expect(result.room.specialRoundHistory[result.room.specialRoundHistory.length - 1]?.success).toBe(false);
    expect(result.room.config.specialGame.failPenaltyMs).toBe(180_000);

    const resolved = sendHost(result.room, result.priv, { type: 'host:advance', phaseId: result.room.phase.phaseId }, deps);

    expect(resolved.room.matchClock.status).toBe('running');
    expect(resolved.room.matchClock.remainingMs).toBe(remainingBefore - 180_000);
    expect(resolved.room.matchClock.totalPenaltyMs).toBe(180_000);
    expect(resolved.room.matchLog.some((e) => e.type === 'penalty_applied')).toBe(true);
  });

  it('failure that leaves the match clock at or below zero ends the match immediately as a Hacker win', () => {
    const deps = createTestDeps(61);
    const result = reachSpecialGameResult(deps);

    // Force remaining time below the penalty so this specific failure ends the match.
    const almostOut = structuredClone(result.room);
    almostOut.matchClock = { ...almostOut.matchClock, remainingMs: 100_000 };

    const resolved = sendHost(almostOut, result.priv, { type: 'host:advance', phaseId: almostOut.phase.phaseId }, deps);

    expect(resolved.room.winner).toBe('hackers');
    expect(resolved.room.phase.state).toBe('FINAL_RESULTS');
    expect(resolved.room.matchClock.status).toBe('stopped');
    expect(resolved.room.matchClock.remainingMs).toBe(0); // clamped, never negative
  });
});
