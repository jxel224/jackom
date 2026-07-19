import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, sendHost, setupRoom, startGame } from './helpers/room.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import type { HandleEventResult } from '../src/fsm/result.js';
import type { Deps } from '../src/types/deps.js';

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

function reachFirstHackerCorruption(playerCount: number, deps: Deps, overrides = {}) {
  const setup = setupRoom(playerCount, deps, overrides);
  const started = startGame(setup.room, setup.priv, deps);
  const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
  const atCorruption = expireTimer(acked.room, acked.priv, deps);
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
    // Not due yet — only 1 of 2 rounds played this cycle.
    expect(afterRound1.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(afterRound1.room.specialGameUsed).toBe(false);

    const afterRound2 = advanceOneRegularRoundAndResolve(afterRound1, deps);
    // Now due — the cycle's round quota is met.
    expect(afterRound2.room.phase.state).toBe('SPECIAL_GAME_INTRO');
    expect(afterRound2.room.specialGameUsed).toBe(true);
  });
});

describe('Special-game consequences', () => {
  function reachSpecialGameResult(deps: Deps) {
    // roundsPerCycle: 1 so that after the special game resolves, resolveAfterRoundOrSpecial()
    // lands on FINAL_DISCUSSION rather than immediately re-entering HACKER_CORRUPTION for a next
    // round in the same cycle — which would otherwise immediately consume a freshly-activated
    // Firewall within the same synchronous call, making the "success activates it" assertion
    // below racier to express than it needs to be. Firewall-consumption-on-the-next-round is
    // covered by the dedicated Firewall test in corruption.test.ts (#8).
    const { atCorruption } = reachFirstHackerCorruption(7, deps, {
      specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-after-first-round-once' },
      rules: { ...createDefaultConfig().rules, roundsPerCycle: 1 },
    });
    const afterRound1 = advanceOneRegularRoundAndResolve(atCorruption, deps);
    expect(afterRound1.room.phase.state).toBe('SPECIAL_GAME_INTRO');

    let r = expireTimer(afterRound1.room, afterRound1.priv, deps); // -> SPECIAL_GAME_PLAY
    expect(r.room.phase.state).toBe('SPECIAL_GAME_PLAY');
    r = expireTimer(r.room, r.priv, deps); // GenericSpecialGameModule never completes -> timeout -> failure, -> SPECIAL_GAME_RESULT
    expect(r.room.phase.state).toBe('SPECIAL_GAME_RESULT');
    return r;
  }

  it('17. success activates the Firewall', () => {
    const deps = createTestDeps(53);
    const result = reachSpecialGameResult(deps);

    // The placeholder module always resolves as a failure; to exercise the FSM's OWN success-path
    // consequence logic (independent of any concrete special-game's mechanics, which don't exist
    // yet), we flip the just-recorded historical result to success — a legitimate way to test the
    // state machine's reaction to a module outcome without needing a real special game implemented.
    const flipped = structuredClone(result.room);
    flipped.specialRoundHistory[flipped.specialRoundHistory.length - 1]!.success = true;

    const resolved = sendHost(flipped, result.priv, { type: 'host:advance', phaseId: flipped.phase.phaseId }, deps);

    expect(resolved.room.firewallActive).toBe(true);
    expect(resolved.room.matchLog.some((e) => e.type === 'firewall_activated')).toBe(true);
  });

  it('18a. failure applies NO gameplay penalty while the match clock is disabled (the default)', () => {
    const deps = createTestDeps(59);
    const result = reachSpecialGameResult(deps);
    expect(result.room.matchClock.mode).toBe('disabled');
    expect(result.room.specialRoundHistory[result.room.specialRoundHistory.length - 1]?.success).toBe(false);

    const resolved = sendHost(result.room, result.priv, { type: 'host:advance', phaseId: result.room.phase.phaseId }, deps);

    expect(resolved.room.matchClock.durationMs).toBeNull();
    expect(resolved.room.matchClock.penaltyMs).toBe(0);
    expect(resolved.room.matchLog.some((e) => e.type === 'penalty_applied' && (e.detail as { note?: string }).note?.includes('disabled'))).toBe(true);
  });

  it('18b. failure DOES apply the configured penalty once the match clock is a countdown', () => {
    const deps = createTestDeps(61);
    const result = reachSpecialGameResult(deps);

    const withClock = structuredClone(result.room);
    withClock.matchClock = { mode: 'countdown', startedAt: deps.now(), durationMs: 600_000, penaltyMs: 0, pausedAt: null };

    const resolved = sendHost(withClock, result.priv, { type: 'host:advance', phaseId: withClock.phase.phaseId }, deps);

    expect(resolved.room.matchClock.durationMs).toBe(600_000 - resolved.room.config.specialGame.failPenaltyMs);
    expect(resolved.room.matchClock.penaltyMs).toBe(resolved.room.config.specialGame.failPenaltyMs);
    expect(resolved.room.matchLog.some((e) => e.type === 'penalty_applied' && !(e.detail as { note?: string }).note)).toBe(true);
  });
});
