import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, hackerIdsOf, sendHost, sendPlayer, setupRoom, startGame } from './helpers/room.js';

function reachMinigamePlay(playerCount: number, deps: ReturnType<typeof createTestDeps>) {
  const setup = setupRoom(playerCount, deps);
  const started = startGame(setup.room, setup.priv, deps);
  const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
  const atCorruption = expireTimer(acked.room, acked.priv, deps);
  const hackerIds = hackerIdsOf(atCorruption.priv);

  let room = atCorruption.room;
  let priv = atCorruption.priv;
  for (const hackerId of hackerIds) {
    const res = sendPlayer(room, priv, { type: 'player:submitCorruptionChoice', phaseId: room.phase.phaseId, playerId: hackerId, corrupt: false }, hackerId, deps);
    room = res.room;
    priv = res.priv;
  }
  ({ room, priv } = expireTimer(room, priv, deps)); // MINIGAME_INSTRUCTIONS -> MINIGAME_PLAY
  return { setup, room, priv };
}

describe('Mini-game gameplay actions', () => {
  it('12. accepts ordered actions and applies each exactly once, by seq', () => {
    const deps = createTestDeps(23);
    const { setup, room, priv } = reachMinigamePlay(6, deps);
    expect(room.phase.state).toBe('MINIGAME_PLAY');
    const actor = setup.playerIds.find((id) => room.currentRound?.participantIds.includes(id))!;

    const r1 = sendPlayer(room, priv, { type: 'player:submitAction', phaseId: room.phase.phaseId, playerId: actor, seq: 1, actionId: 'a1', actionType: 'noop', data: null }, actor, deps);
    expect(r1.rejected).toBeUndefined();
    expect((r1.room.currentRound?.moduleState as { ticks: number }).ticks).toBe(1);

    const r2 = sendPlayer(r1.room, r1.priv, { type: 'player:submitAction', phaseId: r1.room.phase.phaseId, playerId: actor, seq: 2, actionId: 'a2', actionType: 'noop', data: null }, actor, deps);
    expect(r2.rejected).toBeUndefined();
    expect((r2.room.currentRound?.moduleState as { ticks: number }).ticks).toBe(2);
    expect(r2.room.currentRound?.lastSeq[actor]).toBe(2);
  });

  it('13. a retried action (same seq + same actionId) is not processed twice', () => {
    const deps = createTestDeps(29);
    const { setup, room, priv } = reachMinigamePlay(6, deps);
    const actor = setup.playerIds.find((id) => room.currentRound?.participantIds.includes(id))!;

    const first = sendPlayer(room, priv, { type: 'player:submitAction', phaseId: room.phase.phaseId, playerId: actor, seq: 1, actionId: 'dup-1', actionType: 'noop', data: null }, actor, deps);
    const retry = sendPlayer(first.room, first.priv, { type: 'player:submitAction', phaseId: first.room.phase.phaseId, playerId: actor, seq: 1, actionId: 'dup-1', actionType: 'noop', data: null }, actor, deps);

    expect(retry.rejected).toBeUndefined(); // treated as a harmless retry, not an error
    expect((retry.room.currentRound?.moduleState as { ticks: number }).ticks).toBe(1); // NOT incremented again
  });

  it('14. an out-of-order action (lower seq, new actionId) is rejected and does not mutate state', () => {
    const deps = createTestDeps(31);
    const { setup, room, priv } = reachMinigamePlay(6, deps);
    const actor = setup.playerIds.find((id) => room.currentRound?.participantIds.includes(id))!;

    const ahead = sendPlayer(room, priv, { type: 'player:submitAction', phaseId: room.phase.phaseId, playerId: actor, seq: 5, actionId: 'a5', actionType: 'noop', data: null }, actor, deps);
    expect((ahead.room.currentRound?.moduleState as { ticks: number }).ticks).toBe(1);

    const stale = sendPlayer(ahead.room, ahead.priv, { type: 'player:submitAction', phaseId: ahead.room.phase.phaseId, playerId: actor, seq: 3, actionId: 'a3-late', actionType: 'noop', data: null }, actor, deps);

    expect(stale.rejected?.code).toBe('OUT_OF_ORDER');
    expect((stale.room.currentRound?.moduleState as { ticks: number }).ticks).toBe(1); // unchanged
  });

  it('a non-participant submitting an action is rejected', () => {
    const deps = createTestDeps(37);
    const { room, priv } = reachMinigamePlay(6, deps);
    const nonParticipant = 'not-a-real-player-id';

    const result = sendPlayer(room, priv, { type: 'player:submitAction', phaseId: room.phase.phaseId, playerId: nonParticipant, seq: 1, actionId: 'x', actionType: 'noop', data: null }, nonParticipant, deps);

    expect(result.rejected?.code).toBe('NOT_PARTICIPANT');
  });

  it('15. a completed round is pushed to roundHistory, and currentRound clears once RESULTS_REVEAL exits', () => {
    const deps = createTestDeps(41);
    const { room, priv } = reachMinigamePlay(6, deps);

    const hostForced = sendHost(room, priv, { type: 'host:forceEndMinigame', phaseId: room.phase.phaseId }, deps);

    expect(hostForced.room.phase.state).toBe('RESULTS_REVEAL');
    expect(hostForced.room.roundHistory).toHaveLength(1);
    expect(hostForced.room.roundHistory[0]?.success).toBe(true);
    expect(hostForced.room.currentRound).not.toBeNull(); // still populated during RESULTS_REVEAL itself

    const afterResults = expireTimer(hostForced.room, hostForced.priv, deps);
    expect(afterResults.room.phase.state).toBe('DISCUSSION');
    expect(afterResults.room.currentRound).toBeNull();
    expect(afterResults.room.roundHistory).toHaveLength(1); // untouched
  });
});
