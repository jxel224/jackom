import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import {
  ackAllReveals,
  adminSelectMinigame,
  crewIdsOf,
  driveToAdminSelection,
  driveToFirstCorruptionPhase,
  expireTimer,
  hackerIdsOf,
  sendHost,
  sendPlayer,
  setupRoom,
  startGame,
  submitHack,
} from './helpers/room.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import { buildTvView } from '../src/views/build-tv-view.js';

/**
 * Replaces the old round-wide corruption.test.ts entirely (Core Logic Phase 1 — see
 * GAMEPLAY_RULES_V1.md §7 and CORE_LOGIC_PHASE1_REPORT.md §2/§6). The old tests asserted an
 * unlimited, untargeted, per-round boolean "corrupt everyone" toggle — that mechanic no longer
 * exists, so those tests are obsolete, not merely broken, and are not preserved.
 *
 * Hardened in Core Logic Phase 1.1 (CORE_LOGIC_PHASE1_1_HARDENING_REPORT.md §3): the original pass
 * of this file relied on `driveToFirstCorruptionPhase`'s RANDOM participant selection for several
 * tests, guarded by `if (...) return` when the random draw didn't happen to produce the needed
 * role composition (e.g. two Hackers both landing in the round). That is a false-positive-test
 * pattern — the test reports PASS even when its primary assertion never ran. Every test in this
 * file that needs a SPECIFIC role composition now uses `driveToAdminSelection` + an explicit
 * `adminSelectMinigame(...)` call built from `hackerIdsOf`/`crewIdsOf` (known and final the moment
 * roles are assigned, well before MINIGAME_SELECT), which GUARANTEES the composition by
 * construction — no conditional skip anywhere in this file.
 */

describe('Hack window (targeted, budgeted)', () => {
  it('every Hacker starts a fresh match with exactly 2 hacks remaining', () => {
    const deps = createTestDeps(101);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const hackerIds = hackerIdsOf(atCorruption.priv);
    expect(hackerIds.length).toBeGreaterThanOrEqual(1); // guaranteed by the role-balance formula at 6 players, not luck
    for (const hackerId of hackerIds) {
      expect(atCorruption.priv.hacksRemaining[hackerId]).toBe(2);
    }
    for (const crewId of crewIdsOf(atCorruption.priv)) {
      expect(atCorruption.priv.hacksRemaining[crewId]).toBe(0);
    }
  });

  it('Scenario A — a valid hack on a Crew target is accepted, flips only that target, and consumes exactly one charge', () => {
    const deps = createTestDeps(103);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atSelect = driveToAdminSelection(setup, deps);
    const hackerId = hackerIdsOf(atSelect.priv)[0]!;
    const [crewTarget, untouchedCrew] = crewIdsOf(atSelect.priv);
    expect(crewTarget).toBeDefined();
    expect(untouchedCrew).toBeDefined(); // guaranteed: 6 players, >=1 hacker by formula, leaves >=4 crew

    const atCorruption = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', [hackerId, crewTarget!, untouchedCrew!], deps);
    expect(atCorruption.rejected).toBeUndefined();
    expect(atCorruption.room.phase.state).toBe('HACKER_CORRUPTION');

    const result = submitHack(atCorruption.room, atCorruption.priv, hackerId, crewTarget!, deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.currentRound?.hackedPlayerIds).toEqual([crewTarget]);
    expect(result.priv.hacksRemaining[hackerId]).toBe(1);

    const proceeded = expireTimer(result.room, result.priv, deps);
    expect(proceeded.room.phase.state).toBe('MINIGAME_INSTRUCTIONS');
    const assignment = (proceeded.room.currentRound?.moduleState as { promptAssignments?: Record<string, { prompt: string }> } | null)
      ?.promptAssignments;
    expect(assignment).toBeDefined();
    expect(assignment![crewTarget!]).toBeDefined();
    expect(assignment![untouchedCrew!]).toBeDefined();
    // The targeted Crew player now holds the Hacker-variant prompt; the untouched Crew participant keeps the normal one.
    expect(assignment![crewTarget!]?.prompt).not.toBe(assignment![untouchedCrew!]?.prompt);
  });

  it('Scenario C — Hacker A targets Hacker B: B receives the Crew prompt, A consumes one charge', () => {
    const deps = createTestDeps(107);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } }); // 6p -> exactly 2 Hackers, guaranteed by formula
    const atSelect = driveToAdminSelection(setup, deps);
    const [hackerA, hackerB] = hackerIdsOf(atSelect.priv);
    expect(hackerA).toBeDefined();
    expect(hackerB).toBeDefined(); // guaranteed: 6 players -> round(6*0.25)=2 hackers exactly
    const crewId = crewIdsOf(atSelect.priv)[0]!;

    const atCorruption = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', [hackerA!, hackerB!, crewId], deps);
    expect(atCorruption.rejected).toBeUndefined();

    const result = submitHack(atCorruption.room, atCorruption.priv, hackerA!, hackerB!, deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.currentRound?.hackedPlayerIds).toEqual([hackerB]);
    expect(result.priv.hacksRemaining[hackerA!]).toBe(1);
    expect(result.priv.hacksRemaining[hackerB!]).toBe(2); // B's own charges are untouched — only A spent one
  });

  it('Scenario B — a Hacker may target themself if participating: receives the Crew prompt, consumes one charge', () => {
    const deps = createTestDeps(109);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atSelect = driveToAdminSelection(setup, deps);
    const hackerId = hackerIdsOf(atSelect.priv)[0]!;
    const crewId = crewIdsOf(atSelect.priv)[0]!;

    const atCorruption = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', [hackerId, crewId], deps);
    expect(atCorruption.rejected).toBeUndefined();
    expect(atCorruption.room.currentRound?.participantIds).toContain(hackerId);

    const result = submitHack(atCorruption.room, atCorruption.priv, hackerId, hackerId, deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.currentRound?.hackedPlayerIds).toEqual([hackerId]);
    expect(result.priv.hacksRemaining[hackerId]).toBe(1);
  });

  it('targeting a non-participant is rejected as INVALID_TARGET', () => {
    const deps = createTestDeps(113);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const hackerId = hackerIdsOf(atCorruption.priv)[0]!;
    const outsider = 'definitely-not-a-participant';
    const result = submitHack(atCorruption.room, atCorruption.priv, hackerId, outsider, deps);
    expect(result.rejected?.code).toBe('INVALID_TARGET');
    expect(result.priv.hacksRemaining[hackerId]).toBe(2); // unchanged
  });

  it('a non-Hacker sender is rejected as NOT_HACKER', () => {
    const deps = createTestDeps(127);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const crewId = crewIdsOf(atCorruption.priv)[0]!;
    const someTarget = atCorruption.room.currentRound!.participantIds[0]!;
    const result = submitHack(atCorruption.room, atCorruption.priv, crewId, someTarget, deps);
    expect(result.rejected?.code).toBe('NOT_HACKER');
  });

  it('zero charges remaining is rejected as NO_HACKS_REMAINING', () => {
    const deps = createTestDeps(131);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const hackerId = hackerIdsOf(atCorruption.priv)[0]!;
    atCorruption.priv.hacksRemaining[hackerId] = 0;
    const target = atCorruption.room.currentRound!.participantIds.find((id) => id !== hackerId)!;
    const result = submitHack(atCorruption.room, atCorruption.priv, hackerId, target, deps);
    expect(result.rejected?.code).toBe('NO_HACKS_REMAINING');
  });

  it('maximum one accepted hack per Hacker per round: a second attempt (even at a different target) is rejected without consuming a charge', () => {
    const deps = createTestDeps(137);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const hackerId = hackerIdsOf(atCorruption.priv)[0]!;
    const [targetA, targetB] = atCorruption.room.currentRound!.participantIds.filter((id) => id !== hackerId);
    expect(targetA).toBeDefined();

    const first = submitHack(atCorruption.room, atCorruption.priv, hackerId, targetA!, deps);
    expect(first.rejected).toBeUndefined();
    expect(first.priv.hacksRemaining[hackerId]).toBe(1);

    const second = submitHack(first.room, first.priv, hackerId, targetB ?? targetA!, deps);
    expect(second.rejected?.code).toBe('ALREADY_HACKED_THIS_ROUND');
    expect(second.priv.hacksRemaining[hackerId]).toBe(1); // unchanged by the rejected attempt
  });

  it('a rejected attempt (invalid target) does not block a subsequent valid attempt the same round', () => {
    const deps = createTestDeps(139);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const hackerId = hackerIdsOf(atCorruption.priv)[0]!;
    const validTarget = atCorruption.room.currentRound!.participantIds.find((id) => id !== hackerId)!;

    const invalid = submitHack(atCorruption.room, atCorruption.priv, hackerId, 'not-a-participant', deps);
    expect(invalid.rejected?.code).toBe('INVALID_TARGET');

    const valid = submitHack(invalid.room, invalid.priv, hackerId, validTarget, deps);
    expect(valid.rejected).toBeUndefined();
    expect(valid.priv.hacksRemaining[hackerId]).toBe(1);
  });

  it('Scenario D — two different Hackers may each hack a different Crew target in the same round, independently', () => {
    const deps = createTestDeps(149);
    const setup = setupRoom(9, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } }); // 9p -> exactly 2 Hackers, guaranteed by formula
    const atSelect = driveToAdminSelection(setup, deps);
    const [hackerA, hackerB] = hackerIdsOf(atSelect.priv);
    expect(hackerA).toBeDefined();
    expect(hackerB).toBeDefined();
    const [targetA, targetB] = crewIdsOf(atSelect.priv);
    expect(targetA).toBeDefined();
    expect(targetB).toBeDefined();

    const atCorruption = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', [hackerA!, hackerB!, targetA!, targetB!], deps);
    expect(atCorruption.rejected).toBeUndefined();

    const afterA = submitHack(atCorruption.room, atCorruption.priv, hackerA!, targetA!, deps);
    expect(afterA.rejected).toBeUndefined();
    const afterB = submitHack(afterA.room, afterA.priv, hackerB!, targetB!, deps);
    expect(afterB.rejected).toBeUndefined();
    expect(afterB.room.currentRound?.hackedPlayerIds.slice().sort()).toEqual([targetA, targetB].sort());
    expect(afterB.priv.hacksRemaining[hackerA!]).toBe(1);
    expect(afterB.priv.hacksRemaining[hackerB!]).toBe(1);
  });

  it('Scenario E — two Hackers targeting the same Crew player: first accepted locks the target, second is rejected and consumes zero charges', () => {
    const deps = createTestDeps(151);
    const setup = setupRoom(9, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atSelect = driveToAdminSelection(setup, deps);
    const [hackerA, hackerB] = hackerIdsOf(atSelect.priv);
    expect(hackerA).toBeDefined();
    expect(hackerB).toBeDefined();
    const sharedTarget = crewIdsOf(atSelect.priv)[0]!;

    const atCorruption = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', [hackerA!, hackerB!, sharedTarget], deps);
    expect(atCorruption.rejected).toBeUndefined();

    const afterA = submitHack(atCorruption.room, atCorruption.priv, hackerA!, sharedTarget, deps);
    expect(afterA.rejected).toBeUndefined();

    const afterB = submitHack(afterA.room, afterA.priv, hackerB!, sharedTarget, deps);
    expect(afterB.rejected?.code).toBe('TARGET_ALREADY_HACKED');
    expect(afterB.priv.hacksRemaining[hackerB!]).toBe(2); // rejected attempt, no charge spent
    expect(afterB.room.currentRound?.hackedPlayerIds).toEqual([sharedTarget]); // still just the one
  });

  it('a duplicate/replayed hack message from the same hacker at the same target cannot consume twice', () => {
    const deps = createTestDeps(157);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const hackerId = hackerIdsOf(atCorruption.priv)[0]!;
    const target = atCorruption.room.currentRound!.participantIds.find((id) => id !== hackerId)!;

    const first = submitHack(atCorruption.room, atCorruption.priv, hackerId, target, deps);
    expect(first.rejected).toBeUndefined();
    const replay = submitHack(first.room, first.priv, hackerId, target, deps);
    expect(replay.rejected?.code).toBe('ALREADY_HACKED_THIS_ROUND');
    expect(replay.priv.hacksRemaining[hackerId]).toBe(1);
  });

  it('Scenario G — a stale phaseId cannot consume a charge; reconnect afterwards still reflects the correct remaining count', () => {
    const deps = createTestDeps(163);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const hackerId = hackerIdsOf(atCorruption.priv)[0]!;
    const target = atCorruption.room.currentRound!.participantIds.find((id) => id !== hackerId)!;
    const staleResult = sendPlayer(
      atCorruption.room,
      atCorruption.priv,
      { type: 'player:submitHack', phaseId: 'a-stale-phase-id', playerId: hackerId, targetPlayerId: target },
      hackerId,
      deps,
    );
    expect(staleResult.rejected?.code).toBe('STALE_PHASE');
    expect(staleResult.priv.hacksRemaining[hackerId]).toBe(2);

    // Now spend one for real, then simulate the same player reconnecting (a fresh socket, same
    // playerId/priv) and re-check hacksRemaining is still exactly 1 — not reset, not double-spent.
    const spent = submitHack(atCorruption.room, atCorruption.priv, hackerId, target, deps);
    expect(spent.rejected).toBeUndefined();
    const reconnected = sendPlayer(spent.room, spent.priv, { type: 'player:reconnected', playerId: hackerId }, hackerId, deps);
    expect(reconnected.priv.hacksRemaining[hackerId]).toBe(1);
  });

  it('Scenario G — hacksRemaining survives a full Redis-shaped serialization round-trip (JSON.parse(JSON.stringify(...))) unchanged', () => {
    const deps = createTestDeps(167);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const hackerId = hackerIdsOf(atCorruption.priv)[0]!;
    const target = atCorruption.room.currentRound!.participantIds.find((id) => id !== hackerId)!;
    const afterHack = submitHack(atCorruption.room, atCorruption.priv, hackerId, target, deps);
    expect(afterHack.priv.hacksRemaining[hackerId]).toBe(1);
    const cloned = JSON.parse(JSON.stringify(afterHack.priv));
    expect(cloned.hacksRemaining[hackerId]).toBe(1);
  });

  it('rematch (host:restartMatch) resets hacksRemaining to empty (roles/charges are only assigned again at the next ROLE_ASSIGNMENT)', () => {
    const deps = createTestDeps(173);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atCorruption = driveToFirstCorruptionPhase(setup, deps);
    const hackerId = hackerIdsOf(atCorruption.priv)[0]!;
    const target = atCorruption.room.currentRound!.participantIds.find((id) => id !== hackerId)!;
    const afterHack = submitHack(atCorruption.room, atCorruption.priv, hackerId, target, deps);
    expect(afterHack.priv.hacksRemaining[hackerId]).toBe(1);

    // host:restartMatch is valid from FINAL_RESULTS/REMATCH_LOBBY only — force the room into
    // FINAL_RESULTS via explicit, deliberate fixture construction (not a random/lucky drive) the
    // same way match-clock.test.ts's rematch test does, since actually playing a match out to a
    // real win condition is a separate, already-covered concern (win-conditions.test.ts).
    const atFinalResults = structuredClone(afterHack.room);
    atFinalResults.winner = 'crew';
    atFinalResults.phase = { ...atFinalResults.phase, state: 'FINAL_RESULTS' };

    const afterRestart = sendHost(atFinalResults, afterHack.priv, { type: 'host:restartMatch' }, deps);
    expect(afterRestart.rejected).toBeUndefined();
    expect(afterRestart.room.phase.state).toBe('LOBBY');
    expect(afterRestart.priv.hacksRemaining).toEqual({}); // resetMatchScopedState clears it outright — repopulated at the next performRoleAssignment
    for (const p of Object.values(afterRestart.priv.players)) {
      expect(p.role).toBeNull(); // roles cleared too, symmetric with hacksRemaining
    }
  });

  it('Firewall active: hack rejected server-side (defense-in-depth), and the real flow proves the window is bypassed before any client action can land', () => {
    const deps = createTestDeps(179);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    const afterIntro = expireTimer(acked.room, acked.priv, deps); // -> MINIGAME_SELECT
    afterIntro.room.firewallActive = true; // simulate an earlier special-game success
    const afterSelectionTimeout = expireTimer(afterIntro.room, afterIntro.priv, deps); // Admin timeout -> HACKER_CORRUPTION, immediately bypassed by firewall

    // Firewall auto-resolves the hack window instantly — we land straight on MINIGAME_INSTRUCTIONS.
    expect(afterSelectionTimeout.room.phase.state).toBe('MINIGAME_INSTRUCTIONS');
    expect(afterSelectionTimeout.room.currentRound?.hackedPlayerIds).toEqual([]);
    expect(afterSelectionTimeout.room.firewallActive).toBe(false); // consumed
    expect(afterSelectionTimeout.room.matchLog.some((e) => e.type === 'firewall_consumed')).toBe(true);

    // Defense-in-depth: the real flow above proves a hack attempt can never structurally reach the
    // hack window while Firewall is active (autoAdvance() bypasses it synchronously the instant
    // it's entered). To prove the handler ALSO rejects it explicitly — not merely "never gets
    // asked" — hand-craft a room that is still (impossibly, outside the real transition path)
    // sitting in HACKER_CORRUPTION with firewallActive true, and submit a manually-crafted message
    // directly against it, exactly as a malicious/buggy client could attempt over the wire.
    const deps2 = createTestDeps(181);
    const setup2 = setupRoom(6, deps2, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const normalCorruption = driveToFirstCorruptionPhase(setup2, deps2);
    expect(normalCorruption.room.phase.state).toBe('HACKER_CORRUPTION');
    const forcedRoom = { ...normalCorruption.room, firewallActive: true };
    const hackerId = hackerIdsOf(normalCorruption.priv)[0]!;
    const target = normalCorruption.room.currentRound!.participantIds.find((id) => id !== hackerId)!;
    const bypassAttempt = submitHack(forcedRoom, normalCorruption.priv, hackerId, target, deps2);
    expect(bypassAttempt.rejected?.code).toBe('FIREWALL_ACTIVE');
    expect(bypassAttempt.priv.hacksRemaining[hackerId]).toBe(2); // nothing consumed
  });
});

describe('Hack secrecy (Core Logic Phase 1.1 — hack targets are completely secret in v1, no reveal policy applies)', () => {
  function setupHackedRound(seed: number, playerCount = 7) {
    const deps = createTestDeps(seed);
    const setup = setupRoom(playerCount, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atSelect = driveToAdminSelection(setup, deps);
    const [hackerA, hackerB] = hackerIdsOf(atSelect.priv);
    const [crewTarget, otherCrew] = crewIdsOf(atSelect.priv);
    const participantIds = [hackerA!, crewTarget!, otherCrew!, ...(hackerB ? [hackerB] : [])].filter((id, i, arr) => arr.indexOf(id) === i);
    const atCorruption = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', participantIds, deps);
    expect(atCorruption.rejected).toBeUndefined();
    const afterHack = submitHack(atCorruption.room, atCorruption.priv, hackerA!, crewTarget!, deps);
    expect(afterHack.rejected).toBeUndefined();
    return { deps, setup, hackerA: hackerA!, hackerB, crewTarget: crewTarget!, otherCrew: otherCrew!, ...afterHack };
  }

  /**
   * Every player id naturally appears in the public roster (name/avatar/alive/connectionStatus),
   * so a bare `not.toContain(targetId)` check would be meaningless (or worse, a false negative
   * trap — see CORE_LOGIC_PHASE1_1_HARDENING_REPORT.md §3 for the exact substring-collision bug
   * this exact mistake caused in a Phase 1 test). What actually matters, verified by direct code
   * audit of every field TvView/PlayerView/HackerPlayerInfo/AdminSelectionInfo can carry
   * (build-tv-view.ts, build-player-view.ts, packages/shared-types/src/views.ts): there is no
   * field anywhere in these types capable of holding "which player was hacked" — `hackedPlayerIds`
   * only exists on the internal `RoomState`/`RoundRecord`, never on a client-facing type. This
   * assertion proves that structurally, not by guessing at possible leaked field names.
   */
  function assertNoHackLeak(payload: unknown, targetId: string): void {
    const json = JSON.stringify(payload);
    expect(json).not.toContain('hackedPlayerIds');
    expect(json).not.toContain('hackerActionsUsed');
    void targetId;
  }

  it('TV before the hack window resolves cannot see the target', () => {
    const { setup, room, priv, crewTarget } = setupHackedRound(191);
    const tvView = buildTvView(room);
    assertNoHackLeak(tvView, crewTarget);
    expect(tvView.currentMinigame).toBeNull(); // still in HACKER_CORRUPTION, module hasn't started yet
    void setup;
    void priv;
  });

  it('TV during MINIGAME_PLAY (after the hack window resolves) cannot see the target', () => {
    const { room, priv, crewTarget, deps } = setupHackedRound(193);
    let current = expireTimer(room, priv, deps); // -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    expect(current.room.phase.state).toBe('MINIGAME_PLAY');
    const tvView = buildTvView(current.room);
    assertNoHackLeak(tvView, crewTarget);
    expect(JSON.stringify(tvView.currentMinigame)).not.toContain('prompt'); // RANK_IT's active TV view never carries prompt text either
  });

  it('TV during RESULTS_REVEAL cannot see which participant was the hack target', () => {
    const { room, priv, crewTarget, deps } = setupHackedRound(197);
    let current = expireTimer(room, priv, deps); // -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    current = expireTimer(current.room, current.priv, deps); // timeout -> RESULTS_REVEAL
    expect(current.room.phase.state).toBe('RESULTS_REVEAL');
    const tvView = buildTvView(current.room);
    assertNoHackLeak(tvView, crewTarget);
    // completeMinigame() pushes to roundHistory BEFORE transitioning into RESULTS_REVEAL, so
    // lastRoundResult IS already populated here — the point of this test is that it never carries
    // the hack target (already proven by assertNoHackLeak above), not that it's absent.
    expect(tvView.lastRoundResult).toEqual({ minigameId: 'RANK_IT', success: false });
  });

  it('TV during DISCUSSION cannot see which participant was the hack target', () => {
    const { room, priv, crewTarget, deps } = setupHackedRound(199);
    let current = expireTimer(room, priv, deps); // -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    current = expireTimer(current.room, current.priv, deps); // -> RESULTS_REVEAL
    current = expireTimer(current.room, current.priv, deps); // -> DISCUSSION
    expect(current.room.phase.state).toBe('DISCUSSION');
    expect(current.room.roundHistory).toHaveLength(1);
    expect(current.room.roundHistory[0]?.hackedPlayerIds).toEqual([crewTarget]); // internal record IS populated — this is fine, it's server-only
    const tvView = buildTvView(current.room);
    assertNoHackLeak(tvView, crewTarget);
    // lastRoundResult is now populated (the round completed) but must not carry the target.
    expect(tvView.lastRoundResult).toEqual({ minigameId: 'RANK_IT', success: false });
  });

  it('TV after the round (next MINIGAME_SELECT) still cannot see which participant was the hack target', () => {
    const { room, priv, crewTarget, deps } = setupHackedRound(211);
    let current = expireTimer(room, priv, deps); // -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    current = expireTimer(current.room, current.priv, deps); // -> RESULTS_REVEAL
    current = expireTimer(current.room, current.priv, deps); // -> DISCUSSION
    current = expireTimer(current.room, current.priv, deps); // -> next MINIGAME_SELECT (roundsPerCycle default 2, still same cycle)
    const tvView = buildTvView(current.room);
    assertNoHackLeak(tvView, crewTarget);
    expect(tvView.lastRoundResult).toEqual({ minigameId: 'RANK_IT', success: false });
  });

  it('the hacked Crew participant themself never receives an explicit "you were hacked" field', () => {
    const { room, priv, crewTarget, deps } = setupHackedRound(223);
    let current = expireTimer(room, priv, deps);
    current = expireTimer(current.room, current.priv, deps);
    current = expireTimer(current.room, current.priv, deps); // -> RESULTS_REVEAL
    const victimView = buildPlayerView(current.room, current.priv, crewTarget);
    assertNoHackLeak(victimView, crewTarget);
    expect(victimView.hackerInfo).toBeNull(); // Crew never gets hackerInfo, hacked or not
  });

  it('an unrelated Crew player (not the target) cannot see who the target was, at any phase', () => {
    const { room, priv, crewTarget, otherCrew, deps } = setupHackedRound(227);
    let current = expireTimer(room, priv, deps);
    current = expireTimer(current.room, current.priv, deps);
    current = expireTimer(current.room, current.priv, deps); // -> RESULTS_REVEAL
    current = expireTimer(current.room, current.priv, deps); // -> DISCUSSION
    const bystanderView = buildPlayerView(current.room, current.priv, otherCrew);
    assertNoHackLeak(bystanderView, crewTarget);
    expect(bystanderView.hackerInfo).toBeNull();
    expect(bystanderView.lastRoundResult).toEqual({ minigameId: 'RANK_IT', success: false });
  });

  it('Hacker A may see their own hacksRemaining/canHackNow, but never a field revealing WHO they targeted after the fact', () => {
    const { room, priv, hackerA, crewTarget } = setupHackedRound(229);
    const hackerView = buildPlayerView(room, priv, hackerA);
    // The accepted hack already showed up synchronously in the submitHack() response above (no
    // rejection) plus hacksRemaining dropping to 1 here — that IS "confirmation of their own
    // accepted target," satisfied by data the Hacker's own client already sent, not a server echo.
    expect(hackerView.hackerInfo?.hacksRemaining).toBe(1);
    assertNoHackLeak(hackerView, crewTarget);
  });

  it('Hacker A must NOT see Hacker B\'s hack target, even though both are Hackers', () => {
    const deps = createTestDeps(233);
    const setup = setupRoom(9, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } }); // 9p -> 2 Hackers guaranteed
    const atSelect = driveToAdminSelection(setup, deps);
    const [hackerA, hackerB] = hackerIdsOf(atSelect.priv);
    expect(hackerA).toBeDefined();
    expect(hackerB).toBeDefined();
    const [targetA, targetB] = crewIdsOf(atSelect.priv);
    expect(targetA).toBeDefined();
    expect(targetB).toBeDefined();

    const atCorruption = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', [hackerA!, hackerB!, targetA!, targetB!], deps);
    const afterA = submitHack(atCorruption.room, atCorruption.priv, hackerA!, targetA!, deps);
    const afterB = submitHack(afterA.room, afterA.priv, hackerB!, targetB!, deps);
    expect(afterB.rejected).toBeUndefined();

    // Hacker A's own view: only A's own state is exposed; nothing in PlayerView (canHackNow,
    // eligibleTargetIds, or otherwise) reveals that B ALSO hacked someone, or who. Note: raw
    // substring search for targetB's id would be a false-positive trap here (both players' ids
    // legitimately appear in the public `others` roster regardless of hacking) — assert on the
    // STRUCTURE instead, exactly like assertNoHackLeak does.
    const hackerAView = buildPlayerView(afterB.room, afterB.priv, hackerA!);
    expect(hackerAView.hackerInfo?.hacksRemaining).toBe(1); // A's own remaining, not B's
    expect(hackerAView.hackerInfo?.canHackNow).toBe(false); // A already acted this round
    expect(hackerAView.hackerInfo?.eligibleTargetIds).toEqual([]); // the one field that COULD carry a target id is empty once acted
    const json = JSON.stringify(hackerAView);
    expect(json).not.toContain('hackedPlayerIds');
    expect(json).not.toContain('hackerActionsUsed');
  });

  it('reconnect does not expose past hacks to a Crew player — a fresh buildPlayerView call after reconnecting still shows nothing', () => {
    const { room, priv, crewTarget, otherCrew, deps } = setupHackedRound(239);
    let current = expireTimer(room, priv, deps);
    current = expireTimer(current.room, current.priv, deps);
    current = expireTimer(current.room, current.priv, deps); // -> RESULTS_REVEAL
    current = expireTimer(current.room, current.priv, deps); // -> DISCUSSION

    const reconnected = sendPlayer(current.room, current.priv, { type: 'player:reconnected', playerId: otherCrew }, otherCrew, deps);
    const viewAfterReconnect = buildPlayerView(reconnected.room, reconnected.priv, otherCrew);
    assertNoHackLeak(viewAfterReconnect, crewTarget);
    expect(viewAfterReconnect.hackerInfo).toBeNull();
  });

  it('serialization sweep: the accepted target id never appears in TvView JSON attached to any hack-related key, across every post-hack phase', () => {
    const { room, priv, crewTarget, deps } = setupHackedRound(241);
    let current = { room, priv };
    const phasesSeen: string[] = [];
    for (let i = 0; i < 6 && current.room.phase.state !== 'DISCUSSION'; i++) {
      phasesSeen.push(current.room.phase.state);
      const tvView = buildTvView(current.room);
      assertNoHackLeak(tvView, crewTarget);
      current = expireTimer(current.room, current.priv, deps);
    }
    phasesSeen.push(current.room.phase.state);
    expect(phasesSeen).toContain('DISCUSSION'); // sanity: the loop actually reached it, not stuck early
    const finalView = buildTvView(current.room);
    assertNoHackLeak(finalView, crewTarget);
  });
});
