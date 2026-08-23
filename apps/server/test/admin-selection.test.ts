import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, adminSelectMinigame, expireTimer, sendHost, sendPlayer, setupRoom, startGame } from './helpers/room.js';
import { getParticipantLimit } from '../src/rules/participant-limits.js';
import { buildPlayerView } from '../src/views/build-player-view.js';

const NO_SPECIAL_GAME = { specialGameScheduleRuleId: 'placeholder-never', specialGameParticipantRuleId: 'bomb-protocol-scaling', insertionPoint: 'end_of_cycle' as const, minParticipants: 3, maxParticipants: 5, failPenaltyMs: 180_000 };

/**
 * Drives a freshly-joined room from LOBBY to the first (real, Admin-waiting) MINIGAME_SELECT
 * phase. `manyRounds: true` disables the special game so a long `collectAdminSequence` run stays
 * inside "another regular round" (back to MINIGAME_SELECT) indefinitely — every normal round now
 * always loops back to MINIGAME_SELECT (the legacy periodic elimination vote that used to divert
 * into FINAL_DISCUSSION/VOTING after `roundsPerCycle` rounds was retired; see PART 1 of the final
 * gameplay closure), so the only remaining thing that could interrupt the loop is the special game.
 */
function reachFirstMinigameSelect(playerCount: number, deps: ReturnType<typeof createTestDeps>, manyRounds = false) {
  const setup = setupRoom(playerCount, deps, {
    minigameSelection: { minigameSelectionRuleId: 'rank-it-only' },
    ...(manyRounds ? { specialGame: NO_SPECIAL_GAME } : {}),
  });
  const started = startGame(setup.room, setup.priv, deps);
  const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
  const atSelect = expireTimer(acked.room, acked.priv, deps); // GAME_INTRO -> MINIGAME_SELECT
  return { setup, atSelect };
}

/**
 * Drives from an at-MINIGAME_SELECT result through N more full rounds via the Admin-selection
 * timeout fallback, to observe adminId across several rounds. The caller must have built the room
 * with the special game disabled (`NO_SPECIAL_GAME`) — otherwise the default schedule rule
 * eventually diverts into SPECIAL_GAME_INTRO instead of another MINIGAME_SELECT, which is a
 * separate, already-covered concern (special-game.test.ts), not what Admin rotation is testing here.
 */
function collectAdminSequence(roomAtSelect: { room: ReturnType<typeof setupRoom>['room']; priv: ReturnType<typeof setupRoom>['priv'] }, rounds: number, deps: ReturnType<typeof createTestDeps>): string[] {
  const sequence: string[] = [];
  let { room, priv } = roomAtSelect;
  for (let i = 0; i < rounds; i++) {
    expect(room.phase.state).toBe('MINIGAME_SELECT');
    sequence.push(room.adminId!);
    let r = expireTimer(room, priv, deps); // Admin timeout fallback -> HACKER_CORRUPTION
    r = expireTimer(r.room, r.priv, deps); // -> MINIGAME_INSTRUCTIONS
    r = expireTimer(r.room, r.priv, deps); // -> MINIGAME_PLAY
    r = expireTimer(r.room, r.priv, deps); // -> RESULTS_REVEAL (generic module "succeeds" on timeout)
    r = expireTimer(r.room, r.priv, deps); // -> DISCUSSION
    r = expireTimer(r.room, r.priv, deps); // -> resolveAfterRoundOrSpecial -> next MINIGAME_SELECT
    room = r.room;
    priv = r.priv;
  }
  return sequence;
}

describe('Admin rotation', () => {
  it('assigns an Admin the moment investigation gameplay begins', () => {
    const deps = createTestDeps(211);
    const { atSelect } = reachFirstMinigameSelect(4, deps);
    expect(atSelect.room.adminId).not.toBeNull();
    expect(Object.keys(atSelect.room.players)).toContain(atSelect.room.adminId);
  });

  it('4-player rotation: no Admin repeats until every eligible player has had a turn, then reshuffles', () => {
    const deps = createTestDeps(223);
    const { setup, atSelect } = reachFirstMinigameSelect(4, deps, true);
    const sequence = collectAdminSequence(atSelect, 8, deps);

    const firstCycle = sequence.slice(0, 4);
    const secondCycle = sequence.slice(4, 8);
    expect(new Set(firstCycle).size).toBe(4); // all 4 players got a turn, no repeats
    expect(new Set(firstCycle)).toEqual(new Set(setup.playerIds));
    expect(new Set(secondCycle).size).toBe(4); // the reshuffled cycle also covers everyone exactly once
    expect(new Set(secondCycle)).toEqual(new Set(setup.playerIds));
  });

  it('10-player rotation: no Admin repeats until every eligible player has had a turn, then reshuffles', () => {
    const deps = createTestDeps(227);
    const { setup, atSelect } = reachFirstMinigameSelect(10, deps, true);
    const sequence = collectAdminSequence(atSelect, 20, deps);

    const firstCycle = sequence.slice(0, 10);
    const secondCycle = sequence.slice(10, 20);
    expect(new Set(firstCycle).size).toBe(10);
    expect(new Set(firstCycle)).toEqual(new Set(setup.playerIds));
    expect(new Set(secondCycle).size).toBe(10);
    expect(new Set(secondCycle)).toEqual(new Set(setup.playerIds));
  });

  it('Admin queue survives room rehydration (structuredClone/JSON round-trip, standing in for a Redis reload)', () => {
    const deps = createTestDeps(229);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const rehydrated = JSON.parse(JSON.stringify(atSelect.room));
    expect(rehydrated.adminId).toBe(atSelect.room.adminId);
    expect(rehydrated.adminQueue).toEqual(atSelect.room.adminQueue);
  });
});

describe('Admin minigame + participant selection', () => {
  it('the current Admin can select a valid minigame and participant set', () => {
    const deps = createTestDeps(233);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;
    const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);
    const participantIds = others.slice(0, 2);

    const result = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', participantIds, deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(result.room.currentRound?.minigameId).toBe('RANK_IT');
    expect(result.room.currentRound?.adminId).toBe(adminId);
    expect(result.room.currentRound?.adminSelectedParticipantIds).toEqual(participantIds);
    expect(result.room.currentRound?.participantIds).toEqual(participantIds);
  });

  it('the Admin may select themselves as a participant (v1 default — GAMEPLAY_RULES_V1.md §4)', () => {
    const deps = createTestDeps(239);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;
    const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);
    const participantIds = [adminId, others[0]!];

    const result = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', participantIds, deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.currentRound?.participantIds).toContain(adminId);
  });

  it('self-selection is rejected once adminMaySelectSelf is turned off', () => {
    const deps = createTestDeps(241);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' }, rules: { minPlayers: 4, maxPlayers: 10, roundsPerCycle: 2, corruptionRevealPolicy: 'on_results', reconnectGraceMs: 30_000, hostGraceMs: 60_000, afkThresholdMs: 45_000, matchClockTotalMs: 900_000, adminMaySelectSelf: false, accusationCooldownMs: 20_000 } });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    const atSelect = expireTimer(acked.room, acked.priv, deps);
    const adminId = atSelect.room.adminId!;
    const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);

    const result = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', [adminId, others[0]!], deps);
    expect(result.rejected?.code).toBe('INVALID_PARTICIPANTS');
  });

  it('a non-Admin player attempting to select is rejected as NOT_ADMIN', () => {
    const deps = createTestDeps(243);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;
    const impostor = Object.keys(atSelect.room.players).find((id) => id !== adminId)!;

    const result = sendPlayer(
      atSelect.room,
      atSelect.priv,
      { type: 'player:adminSelectMinigame', phaseId: atSelect.room.phase.phaseId, playerId: impostor, minigameId: 'RANK_IT', participantIds: [impostor, adminId] },
      impostor,
      deps,
    );
    expect(result.rejected?.code).toBe('NOT_ADMIN');
  });

  it('a stale Admin selection (old phaseId) is rejected', () => {
    const deps = createTestDeps(251);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;
    const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);

    const result = sendPlayer(
      atSelect.room,
      atSelect.priv,
      { type: 'player:adminSelectMinigame', phaseId: 'a-stale-phase-id', playerId: adminId, minigameId: 'RANK_IT', participantIds: others.slice(0, 2) },
      adminId,
      deps,
    );
    expect(result.rejected?.code).toBe('STALE_PHASE');
  });

  it('an invalid/unknown minigame id is rejected, including the special game id', () => {
    const deps = createTestDeps(257);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;
    const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);

    const unknown = adminSelectMinigame(atSelect.room, atSelect.priv, 'NOT_A_REAL_GAME', others.slice(0, 2), deps);
    expect(unknown.rejected?.code).toBe('INVALID_MINIGAME_ID');

    const specialGameId = adminSelectMinigame(atSelect.room, atSelect.priv, 'BOMB_PROTOCOL', others.slice(0, 3), deps);
    expect(specialGameId.rejected?.code).toBe('INVALID_MINIGAME_ID');
  });

  it('an out-of-range participant count is rejected per the central limit table', () => {
    const deps = createTestDeps(263);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;
    const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);
    const limit = getParticipantLimit('DRAW_IT')!;
    expect(limit).toEqual({ min: 2, max: 4 });

    const tooFew = adminSelectMinigame(atSelect.room, atSelect.priv, 'DRAW_IT', others.slice(0, 1), deps);
    expect(tooFew.rejected?.code).toBe('INVALID_PARTICIPANTS');

    const tooMany = adminSelectMinigame(atSelect.room, atSelect.priv, 'DRAW_IT', others.slice(0, 5), deps);
    expect(tooMany.rejected?.code).toBe('INVALID_PARTICIPANTS');

    const justRight = adminSelectMinigame(atSelect.room, atSelect.priv, 'DRAW_IT', others.slice(0, 4), deps);
    expect(justRight.rejected).toBeUndefined();
  });

  it('duplicate participant ids in the same selection are rejected', () => {
    const deps = createTestDeps(269);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;
    const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);
    const target = others[0]!;

    const result = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', [target, target], deps);
    expect(result.rejected?.code).toBe('INVALID_PARTICIPANTS');
  });

  it('a non-existent/ineligible player id in the selection is rejected', () => {
    const deps = createTestDeps(271);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;
    const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);

    const result = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', [others[0]!, 'not-a-real-player'], deps);
    expect(result.rejected?.code).toBe('INVALID_PARTICIPANTS');
  });

  it('Predict Them requires at least one eligible player left over as the audience', () => {
    const deps = createTestDeps(277);
    const { atSelect } = reachFirstMinigameSelect(4, deps); // 4 players total, 1 is Admin -> 3 non-admin
    const adminId = atSelect.room.adminId!;
    const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);
    expect(others).toHaveLength(3);

    // The Admin themself remains part of the eligible pool even if not selected as a predictor, so
    // selecting only the 3 non-admin players still leaves the Admin as the audience (1 person) —
    // no rejection. Genuinely exhausting the audience requires selecting EVERY eligible player,
    // including the Admin, which PREDICT_THEM's max (4) just barely allows here.
    const stillHasAudience = adminSelectMinigame(atSelect.room, atSelect.priv, 'PREDICT_THEM', others, deps);
    expect(stillHasAudience.rejected).toBeUndefined();
    expect(stillHasAudience.room.currentRound?.participantIds.sort()).toEqual([adminId, ...others].sort());

    const noAudience = adminSelectMinigame(atSelect.room, atSelect.priv, 'PREDICT_THEM', [adminId, ...others], deps);
    expect(noAudience.rejected?.code).toBe('INVALID_PARTICIPANTS');

    const withAudience = adminSelectMinigame(atSelect.room, atSelect.priv, 'PREDICT_THEM', others.slice(0, 2), deps);
    expect(withAudience.rejected).toBeUndefined();
    expect(withAudience.room.currentRound?.participantIds).toHaveLength(4); // 2 predictors + admin + the 1 leftover audience member
  });
});

describe('Admin timeout / disconnect resilience', () => {
  it('if the Admin never acts, the selection window times out and the server auto-selects on their behalf', () => {
    const deps = createTestDeps(281);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId;

    const result = expireTimer(atSelect.room, atSelect.priv, deps);
    expect(result.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(result.room.currentRound).not.toBeNull();
    expect(result.room.currentRound?.adminId).toBe(adminId); // still attributed to the Admin who failed to act
  });

  it('an Admin who disconnects and reconnects before the timeout keeps control and can still select', () => {
    const deps = createTestDeps(283);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;

    const disconnected = sendPlayer(atSelect.room, atSelect.priv, { type: 'player:disconnected', playerId: adminId }, adminId, deps);
    expect(disconnected.room.players[adminId]?.connectionStatus).toBe('disconnected');
    expect(disconnected.room.adminId).toBe(adminId); // never removed from the role by a temporary disconnect

    const reconnected = sendPlayer(disconnected.room, disconnected.priv, { type: 'player:reconnected', playerId: adminId }, adminId, deps);
    expect(reconnected.room.players[adminId]?.connectionStatus).toBe('connected');

    const others = Object.keys(reconnected.room.players).filter((id) => id !== adminId);
    const result = adminSelectMinigame(reconnected.room, reconnected.priv, 'RANK_IT', others.slice(0, 2), deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.currentRound?.adminId).toBe(adminId);
  });

  it('after reconnecting, the Admin private view is correctly restored (isAdmin + adminSelection), and a non-Admin never sees it', () => {
    const deps = createTestDeps(297);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const adminId = atSelect.room.adminId!;
    const nonAdminId = Object.keys(atSelect.room.players).find((id) => id !== adminId)!;

    const disconnected = sendPlayer(atSelect.room, atSelect.priv, { type: 'player:disconnected', playerId: adminId }, adminId, deps);
    const reconnected = sendPlayer(disconnected.room, disconnected.priv, { type: 'player:reconnected', playerId: adminId }, adminId, deps);

    const adminView = buildPlayerView(reconnected.room, reconnected.priv, adminId);
    expect(adminView.isAdmin).toBe(true);
    expect(adminView.adminSelection).not.toBeNull();
    expect(adminView.adminSelection?.availableMinigameIds).toContain('RANK_IT');
    expect(adminView.adminSelection?.eligiblePlayerIds).toEqual(expect.arrayContaining(Object.keys(reconnected.room.players)));

    const nonAdminView = buildPlayerView(reconnected.room, reconnected.priv, nonAdminId);
    expect(nonAdminView.isAdmin).toBe(false);
    expect(nonAdminView.adminSelection).toBeNull();
  });

  it('a temporary disconnect does not remove the Admin from future rotation cycles', () => {
    const deps = createTestDeps(293);
    const { setup, atSelect } = reachFirstMinigameSelect(4, deps, true);
    const firstAdmin = atSelect.room.adminId!;

    const disconnected = sendPlayer(atSelect.room, atSelect.priv, { type: 'player:disconnected', playerId: firstAdmin }, firstAdmin, deps);
    const sequence = collectAdminSequence({ room: disconnected.room, priv: disconnected.priv }, 4, deps);
    expect(new Set(sequence)).toEqual(new Set(setup.playerIds)); // firstAdmin still gets their turn in the cycle
  });
});

describe('Admin selection timeout is host-forceable like other phases', () => {
  it('host:advance is not valid here (MINIGAME_SELECT only accepts the Admin action or its own timer)', () => {
    const deps = createTestDeps(307);
    const { atSelect } = reachFirstMinigameSelect(6, deps);
    const result = sendHost(atSelect.room, atSelect.priv, { type: 'host:advance', phaseId: atSelect.room.phase.phaseId }, deps);
    expect(result.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
  });
});
