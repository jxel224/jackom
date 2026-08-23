import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, adminSelectMinigame, expireTimer, sendHost, sendPlayer, setupRoom, startGame } from './helpers/room.js';

const NO_SPECIAL_GAME = { specialGame: { specialGameScheduleRuleId: 'placeholder-never', specialGameParticipantRuleId: 'bomb-protocol-scaling', insertionPoint: 'end_of_cycle' as const, minParticipants: 3, maxParticipants: 5, failPenaltyMs: 180_000 } };

describe('Match clock — when it runs (GAMEPLAY_RULES_V1.md §1/§2)', () => {
  it('is pending (not running) through LOBBY, ROLE_ASSIGNMENT, and ROLE_REVEAL', () => {
    const deps = createTestDeps(311);
    const setup = setupRoom(4, deps);
    expect(setup.room.matchClock.status).toBe('pending');

    const started = startGame(setup.room, setup.priv, deps);
    expect(started.room.phase.state).toBe('ROLE_REVEAL');
    expect(started.room.matchClock.status).toBe('pending');

    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    expect(acked.room.phase.state).toBe('GAME_INTRO');
    expect(acked.room.matchClock.status).toBe('pending'); // still not started — GAME_INTRO itself hasn't exited yet
  });

  it('starts running the instant GAME_INTRO exits into MINIGAME_SELECT, for approximately 15 minutes', () => {
    const deps = createTestDeps(313);
    const setup = setupRoom(4, deps);
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    expect(setup.room.config.rules.matchClockTotalMs).toBe(900_000);

    const afterIntro = expireTimer(acked.room, acked.priv, deps);
    expect(afterIntro.room.phase.state).toBe('MINIGAME_SELECT');
    expect(afterIntro.room.matchClock.status).toBe('running');
    expect(afterIntro.room.matchClock.deadlineAt).toBe(afterIntro.room.matchClock.startedAt! + 900_000);
    expect(afterIntro.room.matchClock.remainingMs).toBe(900_000);
  });

  it('keeps running through Admin selection, the hack window, minigame play, results, and discussion', () => {
    const deps = createTestDeps(317);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // -> MINIGAME_SELECT
    expect(current.room.matchClock.status).toBe('running');

    current = expireTimer(current.room, current.priv, deps); // -> HACKER_CORRUPTION
    expect(current.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(current.room.matchClock.status).toBe('running');

    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    expect(current.room.matchClock.status).toBe('running');

    current = expireTimer(current.room, current.priv, deps); // -> RESULTS_REVEAL
    expect(current.room.matchClock.status).toBe('running');

    current = expireTimer(current.room, current.priv, deps); // -> DISCUSSION
    expect(current.room.matchClock.status).toBe('running');
  });

  it('keeps running across repeated normal rounds (the legacy periodic elimination vote no longer interrupts it)', () => {
    const deps = createTestDeps(331);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // -> MINIGAME_SELECT (round 1)
    for (let round = 0; round < 2; round++) {
      current = expireTimer(current.room, current.priv, deps); // Admin-selection timeout -> HACKER_CORRUPTION
      current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_INSTRUCTIONS
      current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
      current = expireTimer(current.room, current.priv, deps); // -> RESULTS_REVEAL
      current = expireTimer(current.room, current.priv, deps); // -> DISCUSSION
      expect(current.room.phase.state).toBe('DISCUSSION');
      expect(current.room.matchClock.status).toBe('running');
      current = expireTimer(current.room, current.priv, deps); // -> next round's MINIGAME_SELECT
    }
    expect(current.room.phase.state).toBe('MINIGAME_SELECT');
    expect(current.room.matchClock.status).toBe('running');
  });

  it('pauses for the entire special-game sequence and resumes unchanged on success', () => {
    const deps = createTestDeps(337);
    const setup = setupRoom(7, deps, {
      minigameSelection: { minigameSelectionRuleId: 'rank-it-only' },
      specialGame: { specialGameScheduleRuleId: 'placeholder-after-first-round-once', specialGameParticipantRuleId: 'bomb-protocol-scaling', insertionPoint: 'between_rounds', minParticipants: 3, maxParticipants: 5, failPenaltyMs: 180_000 },
      rules: { minPlayers: 4, maxPlayers: 10, roundsPerCycle: 1, corruptionRevealPolicy: 'on_results', reconnectGraceMs: 30_000, hostGraceMs: 60_000, afkThresholdMs: 45_000, matchClockTotalMs: 900_000, adminMaySelectSelf: true, accusationCooldownMs: 20_000 },
    });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // -> MINIGAME_SELECT
    current = expireTimer(current.room, current.priv, deps); // -> HACKER_CORRUPTION
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    current = expireTimer(current.room, current.priv, deps); // -> RESULTS_REVEAL
    current = expireTimer(current.room, current.priv, deps); // -> DISCUSSION
    current = expireTimer(current.room, current.priv, deps); // -> SPECIAL_GAME_INTRO (due after round 1)
    expect(current.room.phase.state).toBe('SPECIAL_GAME_INTRO');
    expect(current.room.matchClock.status).toBe('paused');
    const remainingAtPause = current.room.matchClock.remainingMs;

    current = expireTimer(current.room, current.priv, deps); // -> SPECIAL_GAME_PLAY
    expect(current.room.matchClock.status).toBe('paused');
    current = expireTimer(current.room, current.priv, deps); // overall timeout -> failure -> SPECIAL_GAME_RESULT
    expect(current.room.phase.state).toBe('SPECIAL_GAME_RESULT');
    expect(current.room.matchClock.status).toBe('paused');

    // Force a success outcome (the generic Bomb Protocol placeholder always fails on timeout) to
    // isolate the FSM's own success-path clock behavior, same technique special-game.test.ts uses.
    const flipped = structuredClone(current.room);
    flipped.specialRoundHistory[flipped.specialRoundHistory.length - 1]!.success = true;
    const resolved = sendHost(flipped, current.priv, { type: 'host:advance', phaseId: flipped.phase.phaseId }, deps);
    expect(resolved.room.matchClock.status).toBe('running');
    expect(resolved.room.matchClock.remainingMs).toBe(remainingAtPause);
  });

  it('zero remaining time reached during MINIGAME_PLAY ends the match as a Hacker win, invalidating stale round actions', () => {
    const deps = createTestDeps(347);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // -> MINIGAME_SELECT
    current = expireTimer(current.room, current.priv, deps); // -> HACKER_CORRUPTION
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    expect(current.room.phase.state).toBe('MINIGAME_PLAY');
    const stalePhaseId = current.room.phase.phaseId;

    const expiredClock = sendHost(current.room, current.priv, { type: 'matchClock:expired', clockId: current.room.matchClock.clockId }, deps);
    expect(expiredClock.rejected).toBeUndefined();
    expect(expiredClock.room.winner).toBe('hackers');
    expect(expiredClock.room.phase.state).toBe('FINAL_RESULTS');
    expect(expiredClock.room.matchClock.status).toBe('stopped');
    expect(expiredClock.room.currentRound).toBeNull(); // the in-progress minigame is not left hanging

    const staleAction = sendPlayer(expiredClock.room, expiredClock.priv, {
      type: 'player:submitAction', phaseId: stalePhaseId, playerId: setup.playerIds[0]!, seq: 1, actionId: 'x', actionType: 'noop', data: null,
    }, setup.playerIds[0]!, deps);
    expect(staleAction.rejected?.code).toBe('STALE_PHASE');
  });

  it('zero remaining time reached during DISCUSSION ends the match as a Hacker win', () => {
    const deps = createTestDeps(349);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // -> MINIGAME_SELECT
    current = expireTimer(current.room, current.priv, deps); // -> HACKER_CORRUPTION
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    current = expireTimer(current.room, current.priv, deps); // -> RESULTS_REVEAL
    current = expireTimer(current.room, current.priv, deps); // -> DISCUSSION
    expect(current.room.phase.state).toBe('DISCUSSION');

    const expiredClock = sendHost(current.room, current.priv, { type: 'matchClock:expired', clockId: current.room.matchClock.clockId }, deps);
    expect(expiredClock.rejected).toBeUndefined();
    expect(expiredClock.room.winner).toBe('hackers');
    expect(expiredClock.room.phase.state).toBe('FINAL_RESULTS');
    expect(expiredClock.room.currentAccusation).toBeNull();
  });

  it('a duplicated matchClock:expired (same clockId, sent twice) cannot end the match twice', () => {
    const deps = createTestDeps(351);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    const afterIntro = expireTimer(acked.room, acked.priv, deps);
    const clockId = afterIntro.room.matchClock.clockId;

    const first = sendHost(afterIntro.room, afterIntro.priv, { type: 'matchClock:expired', clockId }, deps);
    expect(first.rejected).toBeUndefined();
    expect(first.room.winner).toBe('hackers');
    expect(first.room.phase.state).toBe('FINAL_RESULTS');
    const firstPhaseId = first.room.phase.phaseId;

    // Same clockId, replayed against the room state that already resolved once (this is exactly
    // what a duplicate/racing scheduler callback — or a maliciously replayed message — would send).
    const second = sendHost(first.room, first.priv, { type: 'matchClock:expired', clockId }, deps);
    expect(second.rejected?.code).toBe('STALE_MATCH_CLOCK'); // rejected because winner is already set, not because clockId itself is wrong
    expect(second.room.winner).toBe('hackers'); // unchanged
    expect(second.room.phase.phaseId).toBe(firstPhaseId); // no second transition happened
  });

  it('a stale matchClock:expired (wrong clockId, already paused, or after the match already ended) is rejected as a no-op', () => {
    const deps = createTestDeps(353);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    const afterIntro = expireTimer(acked.room, acked.priv, deps);
    expect(afterIntro.room.matchClock.status).toBe('running');

    const wrongClockId = sendHost(afterIntro.room, afterIntro.priv, { type: 'matchClock:expired', clockId: 'not-the-real-clock-id' }, deps);
    expect(wrongClockId.rejected?.code).toBe('STALE_MATCH_CLOCK');
    expect(wrongClockId.room.winner).toBeNull();

    // Before the clock even starts (still LOBBY), status is 'pending' — also correctly stale.
    const beforeStart = sendHost(setup.room, setup.priv, { type: 'matchClock:expired', clockId: '' }, deps);
    expect(beforeStart.rejected?.code).toBe('STALE_MATCH_CLOCK');
  });

  it('rematch resets the match clock back to pending (fresh 15 minutes on the next match start)', () => {
    const deps = createTestDeps(359);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    const afterIntro = expireTimer(acked.room, acked.priv, deps);
    expect(afterIntro.room.matchClock.status).toBe('running');

    // Force the match to FINAL_RESULTS via the win-condition shortcut isn't wired through this
    // helper set; use host:restartMatch directly, which is valid from FINAL_RESULTS/REMATCH_LOBBY
    // only per the FSM — so first force winner/phase by hand (legitimate for an FSM-level unit
    // test; the transition function itself is what's under test elsewhere).
    const atFinalResults = structuredClone(afterIntro.room);
    atFinalResults.winner = 'crew';
    atFinalResults.phase = { ...atFinalResults.phase, state: 'FINAL_RESULTS' };

    const restarted = sendHost(atFinalResults, afterIntro.priv, { type: 'host:restartMatch' }, deps);
    expect(restarted.rejected).toBeUndefined();
    expect(restarted.room.matchClock.status).toBe('pending');
    expect(restarted.room.matchClock.deadlineAt).toBeNull();
    expect(restarted.room.matchClock.totalPenaltyMs).toBe(0);
  });
});

describe('Admin/TV/Player view can reconstruct the countdown', () => {
  it('TvView and PlayerView both expose the same deadline-based matchClock snapshot, never a pre-computed "time left" string', async () => {
    const { buildTvView } = await import('../src/views/build-tv-view.js');
    const { buildPlayerView } = await import('../src/views/build-player-view.js');
    const deps = createTestDeps(367);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    const afterIntro = expireTimer(acked.room, acked.priv, deps);

    const tvView = buildTvView(afterIntro.room);
    const playerView = buildPlayerView(afterIntro.room, afterIntro.priv, setup.playerIds[0]!);
    expect(tvView.matchClock).toEqual(afterIntro.room.matchClock);
    expect(playerView.matchClock).toEqual(afterIntro.room.matchClock);
    expect(tvView.matchClock.deadlineAt).not.toBeNull();
    expect(tvView.matchClock.status).toBe('running');
  });
});

describe('Admin selection uses the config-driven Predict Them audience rule alongside the match clock', () => {
  it('does not itself affect matchClock state (participant selection and the clock are independent concerns)', () => {
    const deps = createTestDeps(373);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, ...NO_SPECIAL_GAME });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    const afterIntro = expireTimer(acked.room, acked.priv, deps);
    const adminId = afterIntro.room.adminId!;
    const others = Object.keys(afterIntro.room.players).filter((id) => id !== adminId);

    const before = afterIntro.room.matchClock;
    const selected = adminSelectMinigame(afterIntro.room, afterIntro.priv, 'RANK_IT', others.slice(0, 2), deps);
    expect(selected.room.matchClock.status).toBe(before.status);
    expect(selected.room.matchClock.deadlineAt).toBe(before.deadlineAt);
  });
});
