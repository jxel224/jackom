import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { driveToVoting, sendHost, sendPlayer, setupRoom } from './helpers/room.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { buildPlayerView } from '../src/views/build-player-view.js';

const NO_SPECIAL_GAME = { specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-never' } };

describe('Voting privacy', () => {
  it('20. votes stay private (not visible in any view) until voting resolves', () => {
    const deps = createTestDeps(83);
    const setup = setupRoom(6, deps, NO_SPECIAL_GAME);
    const atVoting = driveToVoting(setup, deps);
    expect(atVoting.room.currentVote).not.toBeNull();

    const voterA = setup.playerIds[0]!;
    const voterB = setup.playerIds[1]!;
    const target = setup.playerIds[2]!;

    const afterOneVote = sendPlayer(atVoting.room, atVoting.priv, { type: 'player:submitVote', phaseId: atVoting.room.phase.phaseId, playerId: voterA, targetPlayerId: target }, voterA, deps);

    // The raw `{voterId: targetId}` vote content must never appear in any view — playerIds
    // themselves legitimately appear in the roster, so we check for the specific vote *pairing*,
    // and structurally confirm votingProgress carries counts only.
    const votePairPattern = `"${voterA}":"${target}"`;

    const tvView = buildTvView(afterOneVote.room);
    expect(tvView.votingProgress).toEqual({ votedCount: 1, totalEligible: 6 });
    expect(Object.keys(tvView)).not.toContain('currentVote');
    expect(JSON.stringify(tvView)).not.toContain(votePairPattern);

    const otherPlayerView = buildPlayerView(afterOneVote.room, afterOneVote.priv, voterB);
    expect(JSON.stringify(otherPlayerView)).not.toContain(votePairPattern);

    // Vote content only reaches voteHistory once voting fully resolves.
    expect(afterOneVote.room.voteHistory).toHaveLength(0);
  });

  it("21a. tieBreakRule 'no_elimination' results in no elimination on a tie", () => {
    const deps = createTestDeps(89);
    const setup = setupRoom(4, deps, {
      ...NO_SPECIAL_GAME,
      rules: { ...createDefaultConfig().rules, minPlayers: 4, tieBreakRule: 'no_elimination' },
    });
    const atVoting = driveToVoting(setup, deps);
    const [a, b, c, d] = setup.playerIds as [string, string, string, string];

    let room = atVoting.room;
    let priv = atVoting.priv;
    for (const [voter, target] of [
      [a, c],
      [b, c],
      [c, a],
      [d, a],
    ] as const) {
      const res = sendPlayer(room, priv, { type: 'player:submitVote', phaseId: room.phase.phaseId, playerId: voter, targetPlayerId: target }, voter, deps);
      room = res.room;
      priv = res.priv;
    }

    expect(room.phase.state).toBe('ELIMINATION_RESULT');
    expect(room.voteHistory[0]?.tie).toBe(true);
    expect(room.voteHistory[0]?.eliminatedPlayerId).toBeNull();
    expect(room.players[a]?.alive).toBe(true);
    expect(room.players[c]?.alive).toBe(true);
  });

  it("21b. tieBreakRule 'random' eliminates one of the tied targets", () => {
    const deps = createTestDeps(97);
    const setup = setupRoom(4, deps, {
      ...NO_SPECIAL_GAME,
      rules: { ...createDefaultConfig().rules, minPlayers: 4, tieBreakRule: 'random' },
    });
    const atVoting = driveToVoting(setup, deps);
    const [a, b, c, d] = setup.playerIds as [string, string, string, string];

    let room = atVoting.room;
    let priv = atVoting.priv;
    for (const [voter, target] of [
      [a, c],
      [b, c],
      [c, a],
      [d, a],
    ] as const) {
      const res = sendPlayer(room, priv, { type: 'player:submitVote', phaseId: room.phase.phaseId, playerId: voter, targetPlayerId: target }, voter, deps);
      room = res.room;
      priv = res.priv;
    }

    expect(room.voteHistory[0]?.tie).toBe(true);
    expect([a, c]).toContain(room.voteHistory[0]?.eliminatedPlayerId);
    const eliminated = room.voteHistory[0]?.eliminatedPlayerId!;
    expect(room.players[eliminated]?.alive).toBe(false);
  });

  it("21c. tieBreakRule 'revote' re-enters VOTING once, then falls back to no elimination on a second tie", () => {
    const deps = createTestDeps(101);
    const setup = setupRoom(4, deps, {
      ...NO_SPECIAL_GAME,
      rules: { ...createDefaultConfig().rules, minPlayers: 4, tieBreakRule: 'revote' },
    });
    const atVoting = driveToVoting(setup, deps);
    const [a, b, c, d] = setup.playerIds as [string, string, string, string];
    const firstPhaseId = atVoting.room.phase.phaseId;

    let room = atVoting.room;
    let priv = atVoting.priv;
    for (const [voter, target] of [
      [a, c],
      [b, c],
      [c, a],
      [d, a],
    ] as const) {
      const res = sendPlayer(room, priv, { type: 'player:submitVote', phaseId: room.phase.phaseId, playerId: voter, targetPlayerId: target }, voter, deps);
      room = res.room;
      priv = res.priv;
    }

    // Still tied -> re-entered VOTING with a fresh phaseId, restricted to the tied candidates.
    expect(room.phase.state).toBe('VOTING');
    expect(room.phase.phaseId).not.toBe(firstPhaseId);
    expect(room.currentVote?.revoteOf?.sort()).toEqual([a, c].sort());
    expect(room.voteHistory).toHaveLength(0);

    // A vote for someone NOT in the tied set is rejected during the revote.
    const invalid = sendPlayer(room, priv, { type: 'player:submitVote', phaseId: room.phase.phaseId, playerId: a, targetPlayerId: b }, a, deps);
    expect(invalid.rejected?.code).toBe('INVALID_ACTION');

    // Tie again -> falls back to no elimination (bounded to exactly one revote).
    for (const [voter, target] of [
      [a, c],
      [b, c],
      [c, a],
      [d, a],
    ] as const) {
      const res = sendPlayer(room, priv, { type: 'player:submitVote', phaseId: room.phase.phaseId, playerId: voter, targetPlayerId: target }, voter, deps);
      room = res.room;
      priv = res.priv;
    }

    expect(room.phase.state).toBe('ELIMINATION_RESULT');
    expect(room.voteHistory[0]?.eliminatedPlayerId).toBeNull();
  });

  it('a vote from an ineligible (eliminated) voter is rejected under the default policy', () => {
    const deps = createTestDeps(103);
    const setup = setupRoom(6, deps, NO_SPECIAL_GAME);
    const atVoting = driveToVoting(setup, deps);
    const eliminatedVoter = setup.playerIds[0]!;
    atVoting.room.players[eliminatedVoter]!.alive = false;

    const result = sendPlayer(atVoting.room, atVoting.priv, { type: 'player:submitVote', phaseId: atVoting.room.phase.phaseId, playerId: eliminatedVoter, targetPlayerId: setup.playerIds[1]! }, eliminatedVoter, deps);

    expect(result.rejected?.code).toBe('NOT_ELIGIBLE_VOTER');
  });

  it('host:endVoteEarly forces resolution with missing votes defaulted to skip', () => {
    const deps = createTestDeps(107);
    const setup = setupRoom(5, deps, NO_SPECIAL_GAME);
    const atVoting = driveToVoting(setup, deps);

    const ended = sendHost(atVoting.room, atVoting.priv, { type: 'host:endVoteEarly', phaseId: atVoting.room.phase.phaseId }, deps);

    expect(ended.room.phase.state).toBe('ELIMINATION_RESULT');
    expect(ended.room.voteHistory).toHaveLength(1);
  });
});
