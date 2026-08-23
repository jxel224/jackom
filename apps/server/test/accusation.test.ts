import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import {
  adminSelectMinigame,
  castAccusationVotes,
  crewIdsOf,
  driveToAdminSelection,
  driveToDiscussion,
  expireTimer,
  hackerIdsOf,
  pushButton,
  sendHost,
  sendPlayer,
  setupRoom,
  submitAccusation,
  submitAccusationVote,
} from './helpers/room.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { buildPlayerView } from '../src/views/build-player-view.js';

const NO_SPECIAL_GAME = { specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-never' } };

/** All player ids currently in the room, admin-first-agnostic, insertion order. */
function allIds(room: ReturnType<typeof setupRoom>['room']): string[] {
  return Object.keys(room.players);
}

describe('Accusation — availability (Part 39 "Availability")', () => {
  it('the button is available from MINIGAME_SELECT', () => {
    const deps = createTestDeps(1001);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const result = pushButton(atSelect.room, atSelect.priv, allIds(atSelect.room)[0]!, deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.phase.state).toBe('ACCUSATION_SELECT');
  });

  it('the button is available from DISCUSSION', () => {
    const deps = createTestDeps(1003);
    const setup = setupRoom(4, deps, NO_SPECIAL_GAME);
    const atDiscussion = driveToDiscussion(setup, deps);
    const result = pushButton(atDiscussion.room, atDiscussion.priv, allIds(atDiscussion.room)[0]!, deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.phase.state).toBe('ACCUSATION_SELECT');
  });

  it('the button is unavailable during MINIGAME_PLAY', () => {
    const deps = createTestDeps(1005);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atSelect = driveToAdminSelection(setup, deps);
    const adminId = atSelect.room.adminId!;
    const others = allIds(atSelect.room).filter((id) => id !== adminId);
    const afterSelect = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', others.slice(0, 2), deps);
    const afterHackWindow = expireTimer(afterSelect.room, afterSelect.priv, deps); // -> MINIGAME_INSTRUCTIONS
    const atPlay = expireTimer(afterHackWindow.room, afterHackWindow.priv, deps); // -> MINIGAME_PLAY
    expect(atPlay.room.phase.state).toBe('MINIGAME_PLAY');

    const result = pushButton(atPlay.room, atPlay.priv, adminId, deps);
    expect(result.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
  });

  it('the button is unavailable during the hack window (HACKER_CORRUPTION)', () => {
    const deps = createTestDeps(1007);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atSelect = driveToAdminSelection(setup, deps);
    const adminId = atSelect.room.adminId!;
    const others = allIds(atSelect.room).filter((id) => id !== adminId);
    const afterSelect = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', others.slice(0, 2), deps);
    expect(afterSelect.room.phase.state).toBe('HACKER_CORRUPTION');

    const result = pushButton(afterSelect.room, afterSelect.priv, adminId, deps);
    expect(result.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
  });

  it('the button is unavailable while the special game is active (Part 26)', () => {
    const deps = createTestDeps(1009);
    const setup = setupRoom(7, deps, {
      minigameSelection: { minigameSelectionRuleId: 'rank-it-only' },
      specialGame: { specialGameScheduleRuleId: 'placeholder-after-first-round-once', specialGameParticipantRuleId: 'bomb-protocol-scaling', insertionPoint: 'between_rounds' as const, minParticipants: 3, maxParticipants: 5, failPenaltyMs: 180_000 },
    });
    const atSelect = driveToAdminSelection(setup, deps);
    const adminId = atSelect.room.adminId!;
    const others = allIds(atSelect.room).filter((id) => id !== adminId);
    let last = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', others.slice(0, 2), deps);
    for (let i = 0; i < 10 && last.room.phase.state !== 'SPECIAL_GAME_PLAY'; i++) {
      last = expireTimer(last.room, last.priv, deps);
    }
    expect(last.room.phase.state).toBe('SPECIAL_GAME_PLAY');

    const result = pushButton(last.room, last.priv, adminId, deps);
    expect(result.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
  });

  it('the button is unavailable while an accusation vote is already in progress (crafted double-push)', () => {
    const deps = createTestDeps(1011);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    expect(afterLock.room.phase.state).toBe('ACCUSATION_VOTE');

    const secondPush = pushButton(afterLock.room, afterLock.priv, ids[1]!, deps);
    expect(secondPush.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
  });

  it('the button is unavailable after the match has ended (FINAL_RESULTS)', () => {
    const deps = createTestDeps(1013);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'APPROVE', deps);
    expect(afterVotes.room.phase.state).toBe('FINAL_RESULTS');
    expect(afterVotes.room.winner).toBe('crew');

    const result = pushButton(afterVotes.room, afterVotes.priv, ids[0]!, deps);
    expect(result.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
  });

  it('cooldown is enforced immediately after a rejected accusation, and expires after the configured duration', () => {
    const deps = createTestDeps(1015);
    // Default cooldown (20s) — comfortably longer than the handful of `deps.now()` ticks the fake
    // clock (1000ms/call) advances through while resolving the reject-vote -> return-to-gameplay
    // path, unlike a short custom value that could spuriously already look "expired" by the time
    // this test's own very next pushButton call runs.
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'REJECT', deps);
    expect(afterVotes.room.phase.state).toBe('MINIGAME_SELECT');
    expect(afterVotes.room.accusationCooldownUntil).not.toBeNull();

    const duringCooldown = pushButton(afterVotes.room, afterVotes.priv, ids[0]!, deps);
    expect(duringCooldown.rejected?.code).toBe('ACCUSATION_ON_COOLDOWN');

    // Force-expire the cooldown by mutating the deadline directly (deterministic, no real waiting).
    const pastCooldown = { ...afterVotes.room, accusationCooldownUntil: deps.now() - 1 };
    const afterCooldown = pushButton(pastCooldown, afterVotes.priv, ids[0]!, deps);
    expect(afterCooldown.rejected).toBeUndefined();
  });
});

describe('Accusation — suspect selection (Part 39 "Accusation")', () => {
  it('4-player match requires exactly 1 suspect', () => {
    const deps = createTestDeps(1101);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    expect(atSelect.room.hackerCount).toBe(1);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    expect(afterPush.room.currentAccusation?.requiredSuspectCount).toBe(1);
  });

  it('6-player match requires exactly 2 suspects', () => {
    const deps = createTestDeps(1103);
    const setup = setupRoom(6, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    expect(atSelect.room.hackerCount).toBe(2);
  });

  it('10-player match requires exactly 3 suspects', () => {
    const deps = createTestDeps(1105);
    const setup = setupRoom(10, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    expect(atSelect.room.hackerCount).toBe(3);
  });

  it('too few suspects is rejected', () => {
    const deps = createTestDeps(1107);
    const setup = setupRoom(6, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const hackers = hackerIdsOf(afterPush.priv);
    expect(hackers.length).toBe(2);

    const result = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackers.slice(0, 1), deps);
    expect(result.rejected?.code).toBe('INVALID_SUSPECTS');
    expect(result.room.phase.state).toBe('ACCUSATION_SELECT');
  });

  it('too many suspects is rejected', () => {
    const deps = createTestDeps(1109);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);

    const result = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, ids.slice(0, 2), deps);
    expect(result.rejected?.code).toBe('INVALID_SUSPECTS');
  });

  it('a duplicate suspect id is rejected', () => {
    const deps = createTestDeps(1111);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const target = crewIdsOf(afterPush.priv)[0] ?? ids[0]!;

    const result = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, [target, target], deps);
    // Duplicate collapses to a set of size 1, which also happens to fail the count check first for
    // a 4p match (requires exactly 1) unless requiredSuspectCount is 2 — assert INVALID_SUSPECTS
    // either way, since both are legitimate rejection reasons for this malformed input.
    expect(result.rejected?.code).toBe('INVALID_SUSPECTS');
  });

  it('an unknown/non-existent suspect id is rejected', () => {
    const deps = createTestDeps(1113);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);

    const result = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, ['not-a-real-player'], deps);
    expect(result.rejected?.code).toBe('INVALID_SUSPECTS');
  });

  it('the initiator may nominate themselves', () => {
    const deps = createTestDeps(1115);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);

    const result = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, [ids[0]!], deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.phase.state).toBe('ACCUSATION_VOTE');
    expect(result.room.currentAccusation?.suspectIds).toEqual([ids[0]!]);
  });

  it('a non-initiator cannot submit the suspect set, even with a valid count', () => {
    const deps = createTestDeps(1117);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const impostor = ids[1]!;

    const result = submitAccusation(afterPush.room, afterPush.priv, impostor, [impostor], deps);
    expect(result.rejected?.code).toBe('NOT_INITIATOR');
  });

  it('selection timeout cancels the accusation and returns to gameplay without ending the match', () => {
    const deps = createTestDeps(1119);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const adminId = atSelect.room.adminId!;
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    expect(afterPush.room.phase.state).toBe('ACCUSATION_SELECT');

    const afterTimeout = expireTimer(afterPush.room, afterPush.priv, deps);
    expect(afterTimeout.room.phase.state).toBe('MINIGAME_SELECT');
    expect(afterTimeout.room.currentAccusation).toBeNull();
    expect(afterTimeout.room.winner).toBeNull();
    // Selection-timeout cancellation is explicitly NOT a rejected-vote outcome — no cooldown penalty.
    expect(afterTimeout.room.accusationCooldownUntil).toBeNull();
    // Pushed from MINIGAME_SELECT -> the interrupted Admin turn resumes untouched (Part 28).
    expect(afterTimeout.room.adminId).toBe(adminId);
  });
});

describe('Accusation — voting (Part 39 "Voting")', () => {
  it('every player in the room is an eligible voter, including the initiator and the accused suspects', () => {
    const deps = createTestDeps(1201);
    const setup = setupRoom(6, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    expect(afterLock.room.currentAccusation?.eligibleVoterIds.sort()).toEqual([...ids].sort());
  });

  it('duplicate vote submissions from the same player are rejected and never double-count', () => {
    const deps = createTestDeps(1203);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);

    const firstVote = submitAccusationVote(afterLock.room, afterLock.priv, ids[0]!, 'APPROVE', deps);
    expect(firstVote.rejected).toBeUndefined();
    const secondVote = submitAccusationVote(firstVote.room, firstVote.priv, ids[0]!, 'REJECT', deps);
    expect(secondVote.rejected?.code).toBe('DUPLICATE_ACTION');
    expect(secondVote.room.currentAccusation?.votes[ids[0]!]).toBe('APPROVE'); // unchanged
  });

  it('votes stay completely private until the vote resolves — TV and other players never see who voted which way', () => {
    const deps = createTestDeps(1205);
    const setup = setupRoom(6, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    const afterOneVote = submitAccusationVote(afterLock.room, afterLock.priv, ids[0]!, 'APPROVE', deps);

    const tv = buildTvView(afterOneVote.room);
    expect(tv.accusation?.votedCount).toBe(1);
    expect(tv.accusation?.totalEligible).toBe(6);
    expect(JSON.stringify(tv)).not.toContain('APPROVE');
    expect(JSON.stringify(tv)).not.toContain('REJECT');

    const otherPlayerView = buildPlayerView(afterOneVote.room, afterOneVote.priv, ids[1]!);
    expect(JSON.stringify(otherPlayerView)).not.toContain('APPROVE');
    expect(JSON.stringify(otherPlayerView)).not.toContain('REJECT');
    expect(otherPlayerView.accusation?.hasVoted).toBe(false); // ids[1] hasn't voted, and only their OWN status is exposed

    const voterOwnView = buildPlayerView(afterOneVote.room, afterOneVote.priv, ids[0]!);
    expect(voterOwnView.accusation?.hasVoted).toBe(true); // a player CAN see their own submission status
  });

  it('a tie always rejects, never approves', () => {
    const deps = createTestDeps(1207);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);

    let last = submitAccusationVote(afterLock.room, afterLock.priv, ids[0]!, 'APPROVE', deps);
    last = submitAccusationVote(last.room, last.priv, ids[1]!, 'APPROVE', deps);
    last = submitAccusationVote(last.room, last.priv, ids[2]!, 'REJECT', deps);
    last = submitAccusationVote(last.room, last.priv, ids[3]!, 'REJECT', deps);

    expect(last.room.phase.state).toBe('MINIGAME_SELECT'); // rejected -> returned to gameplay
    expect(last.room.winner).toBeNull();
    expect(last.room.accusationHistory[0]?.approved).toBe(false);
  });

  it('missing votes on timeout do not count toward approval', () => {
    const deps = createTestDeps(1209);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);

    // Only 1 of 4 approves; the rest never vote, then the timer fires.
    const afterOneVote = submitAccusationVote(afterLock.room, afterLock.priv, ids[0]!, 'APPROVE', deps);
    const afterTimeout = expireTimer(afterOneVote.room, afterOneVote.priv, deps);

    expect(afterTimeout.room.winner).toBeNull();
    expect(afterTimeout.room.phase.state).toBe('MINIGAME_SELECT');
    expect(afterTimeout.room.accusationHistory[0]?.approved).toBe(false);
  });

  const THRESHOLD_CASES: Array<{ playerCount: number; approveCount: number; expectApproved: boolean; label: string }> = [
    { playerCount: 4, approveCount: 2, expectApproved: false, label: '4 players: 2 approve / 2 reject -> rejected' },
    { playerCount: 4, approveCount: 3, expectApproved: true, label: '4 players: 3 approve -> approved' },
    { playerCount: 5, approveCount: 3, expectApproved: true, label: '5 players: 3 approve -> approved' },
    { playerCount: 6, approveCount: 3, expectApproved: false, label: '6 players: 3 approve / 3 reject -> rejected' },
    { playerCount: 6, approveCount: 4, expectApproved: true, label: '6 players: 4 approve -> approved' },
    { playerCount: 10, approveCount: 5, expectApproved: false, label: '10 players: 5 approve / 5 reject -> rejected' },
    { playerCount: 10, approveCount: 6, expectApproved: true, label: '10 players: 6 approve -> approved' },
  ];

  for (const [i, tc] of THRESHOLD_CASES.entries()) {
    it(`strict majority threshold — ${tc.label}`, () => {
      const deps = createTestDeps(1300 + i);
      const setup = setupRoom(tc.playerCount, deps);
      const atSelect = driveToAdminSelection(setup, deps);
      const ids = allIds(atSelect.room);
      const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
      const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);

      const approvers = ids.slice(0, tc.approveCount);
      const rejecters = ids.slice(tc.approveCount);
      let last = castAccusationVotes(afterLock.room, afterLock.priv, approvers, 'APPROVE', deps);
      last = castAccusationVotes(last.room, last.priv, rejecters, 'REJECT', deps);

      expect(last.room.accusationHistory[0]?.approved).toBe(tc.expectApproved);
      if (tc.expectApproved) {
        expect(last.room.phase.state).toBe('FINAL_RESULTS');
      } else {
        expect(last.room.phase.state).toBe('MINIGAME_SELECT');
        expect(last.room.winner).toBeNull();
      }
    });
  }
});

describe('Accusation — resolution (Part 39 "Resolution")', () => {
  it('the exact Hacker set, approved, ends the match as a Crew win', () => {
    const deps = createTestDeps(1401);
    const setup = setupRoom(6, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const hackers = hackerIdsOf(atSelect.priv);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackers, deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'APPROVE', deps);

    expect(afterVotes.room.phase.state).toBe('FINAL_RESULTS');
    expect(afterVotes.room.winner).toBe('crew');
    expect(afterVotes.room.matchClock.status).toBe('stopped');
    expect(afterVotes.room.accusationHistory[0]?.correct).toBe(true);
  });

  it('missing even one real Hacker from an approved accusation ends the match as a Hackers win', () => {
    const deps = createTestDeps(1403);
    const setup = setupRoom(10, deps); // hackerCount = 3
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const hackers = hackerIdsOf(atSelect.priv);
    expect(hackers.length).toBe(3);
    const crew = crewIdsOf(atSelect.priv);
    // Nominate 2 real Hackers + 1 Crew instead of the 3rd real Hacker — correct COUNT, wrong SET.
    const wrongSuspects = [hackers[0]!, hackers[1]!, crew[0]!];

    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, wrongSuspects, deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'APPROVE', deps);

    expect(afterVotes.room.winner).toBe('hackers');
    expect(afterVotes.room.accusationHistory[0]?.correct).toBe(false);
  });

  it('substituting a Crew player for a Hacker in an approved accusation ends the match as a Hackers win', () => {
    const deps = createTestDeps(1405);
    const setup = setupRoom(4, deps); // hackerCount = 1
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const crew = crewIdsOf(atSelect.priv);

    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, [crew[0]!], deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'APPROVE', deps);

    expect(afterVotes.room.winner).toBe('hackers');
    expect(afterVotes.room.accusationHistory[0]?.correct).toBe(false);
  });

  it('roles are never exposed in any view before an accusation resolves, win or lose', () => {
    const deps = createTestDeps(1407);
    const setup = setupRoom(6, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const hackers = hackerIdsOf(atSelect.priv);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackers, deps);

    for (const id of ids) {
      const view = buildPlayerView(afterLock.room, afterLock.priv, id);
      expect(JSON.stringify(view)).not.toContain('"role"');
      expect(JSON.stringify(view)).not.toContain('HACKER');
    }
    const tv = buildTvView(afterLock.room);
    expect(JSON.stringify(tv)).not.toContain('"role"');
    expect(JSON.stringify(tv)).not.toContain('HACKER');
  });
});

describe('Accusation — concurrency (Part 39 "Concurrency")', () => {
  it('two simultaneous pushButton attempts: only the first is accepted, the second sees the new (wrong) state', () => {
    const deps = createTestDeps(1501);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);

    const first = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    expect(first.rejected).toBeUndefined();
    expect(first.room.phase.state).toBe('ACCUSATION_SELECT');

    // The "second simultaneous" push, applied against the room state the FIRST one already
    // produced (exactly what RoomActor's serialized queue guarantees in production — see
    // GAMEPLAY_RULES_V1.md §22): MINIGAME_SELECT is no longer the current phase, so it's rejected.
    const second = pushButton(first.room, first.priv, ids[1]!, deps);
    expect(second.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
    expect(first.room.currentAccusation?.initiatorId).toBe(ids[0]!);
  });

  it('a duplicate/replayed vote message never counts twice toward the tally', () => {
    const deps = createTestDeps(1503);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);

    let last = submitAccusationVote(afterLock.room, afterLock.priv, ids[0]!, 'APPROVE', deps);
    last = submitAccusationVote(last.room, last.priv, ids[0]!, 'APPROVE', deps); // replay of the same vote
    expect(Object.keys(last.room.currentAccusation!.votes)).toHaveLength(1);
  });
});

describe('Accusation — match timer interaction (Part 39 "Match timer")', () => {
  it('the match clock does not pause while an accusation is being selected or voted on', () => {
    const deps = createTestDeps(1601);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    expect(atSelect.room.matchClock.status).toBe('running');
    const ids = allIds(atSelect.room);

    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    expect(afterPush.room.matchClock.status).toBe('running');
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    expect(afterLock.room.matchClock.status).toBe('running');
    const afterOneVote = submitAccusationVote(afterLock.room, afterLock.priv, ids[0]!, 'REJECT', deps);
    expect(afterOneVote.room.matchClock.status).toBe('running');
  });

  it('the match clock expiring during ACCUSATION_SELECT ends the match as a Hackers win and abandons the accusation', () => {
    const deps = createTestDeps(1603);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    expect(afterPush.room.phase.state).toBe('ACCUSATION_SELECT');

    const expired = sendHost(afterPush.room, afterPush.priv, { type: 'matchClock:expired', clockId: afterPush.room.matchClock.clockId }, deps);
    expect(expired.room.winner).toBe('hackers');
    expect(expired.room.phase.state).toBe('FINAL_RESULTS');
    expect(expired.room.currentAccusation).toBeNull();

    // Any late accusation message after this must be rejected — the phase is no longer ACCUSATION_SELECT.
    const lateSubmit = submitAccusation(expired.room, expired.priv, ids[0]!, hackerIdsOf(expired.priv), deps);
    expect(lateSubmit.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
  });

  it('the match clock expiring during ACCUSATION_VOTE ends the match as a Hackers win and abandons the vote', () => {
    const deps = createTestDeps(1605);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    expect(afterLock.room.phase.state).toBe('ACCUSATION_VOTE');

    const expired = sendHost(afterLock.room, afterLock.priv, { type: 'matchClock:expired', clockId: afterLock.room.matchClock.clockId }, deps);
    expect(expired.room.winner).toBe('hackers');
    expect(expired.room.phase.state).toBe('FINAL_RESULTS');
    expect(expired.room.currentAccusation).toBeNull();

    // A late vote after the clock already ended the match must be rejected.
    const lateVote = submitAccusationVote(expired.room, expired.priv, ids[1]!, 'APPROVE', deps);
    expect(lateVote.rejected?.code).toBe('INVALID_EVENT_FOR_STATE');
  });
});

describe('Accusation — Admin interaction (Part 39 "Admin")', () => {
  it('a rejected accusation pushed from MINIGAME_SELECT returns to MINIGAME_SELECT with the SAME Admin, unconsumed turn, unchanged queue', () => {
    const deps = createTestDeps(1701);
    const setup = setupRoom(6, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const adminId = atSelect.room.adminId!;
    const queueBefore = [...atSelect.room.adminQueue];
    const ids = allIds(atSelect.room);

    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'REJECT', deps);

    expect(afterVotes.room.phase.state).toBe('MINIGAME_SELECT');
    expect(afterVotes.room.adminId).toBe(adminId);
    expect(afterVotes.room.adminQueue).toEqual(queueBefore);

    // The SAME Admin can still act normally afterward.
    const stillAdmin = allIds(afterVotes.room).filter((id) => id !== adminId);
    const result = adminSelectMinigame(afterVotes.room, afterVotes.priv, 'RANK_IT', stillAdmin.slice(0, 2), deps);
    expect(result.rejected).toBeUndefined();
  });

  it('a rejected accusation pushed from DISCUSSION proceeds normally into the next round with a fresh Admin rotation', () => {
    const deps = createTestDeps(1703);
    const setup = setupRoom(6, deps, NO_SPECIAL_GAME);
    const atDiscussion = driveToDiscussion(setup, deps);
    const previousAdmin = atDiscussion.room.adminId!;
    const ids = allIds(atDiscussion.room);

    const afterPush = pushButton(atDiscussion.room, atDiscussion.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'REJECT', deps);

    expect(afterVotes.room.phase.state).toBe('MINIGAME_SELECT');
    // A fresh Admin was assigned for the next round, exactly as DISCUSSION's own timer would have
    // done — it is NOT required to differ from the previous Admin (rotation may legitimately repeat
    // across cycle boundaries), only required to have gone through real assignment (non-null, and a
    // participant of the match).
    expect(afterVotes.room.adminId).not.toBeNull();
    expect(ids).toContain(afterVotes.room.adminId);
    void previousAdmin;
  });

  it('an accusation approved into FINAL_RESULTS makes Admin state irrelevant (no crash reading it)', () => {
    const deps = createTestDeps(1705);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'APPROVE', deps);
    expect(afterVotes.room.phase.state).toBe('FINAL_RESULTS');
    expect(() => buildTvView(afterVotes.room)).not.toThrow();
  });
});

describe('Accusation — Firewall interaction (Part 39 "Firewall")', () => {
  it('an accusation never consumes or activates the Firewall, whether rejected or approved', () => {
    const deps = createTestDeps(1801);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    expect(atSelect.room.firewallActive).toBe(false);
    const ids = allIds(atSelect.room);

    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'REJECT', deps);
    expect(afterVotes.room.firewallActive).toBe(false);
  });

  it('a pending Firewall (earned before the accusation) survives a rejected accusation untouched', () => {
    const deps = createTestDeps(1803);
    const setup = setupRoom(6, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    // Directly construct the "Firewall already pending" precondition (white-box) rather than
    // playing a real Bomb Protocol round to a deterministic SUCCESS — this test's actual subject is
    // the accusation path's effect (or lack of one) on `firewallActive`, not how a Firewall is
    // legitimately earned (already covered by special-game.test.ts).
    const withFirewall = { ...atSelect.room, firewallActive: true };
    const ids = allIds(withFirewall);

    const afterPush = pushButton(withFirewall, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    expect(afterLock.room.firewallActive).toBe(true); // untouched mid-accusation too
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'REJECT', deps);
    expect(afterVotes.room.firewallActive).toBe(true);
  });
});

describe('Accusation — reconnect (Part 39 "Reconnect")', () => {
  it('the initiator disconnecting and reconnecting before the selection timeout can still submit suspects', () => {
    const deps = createTestDeps(1901);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);

    const disconnected = sendPlayer(afterPush.room, afterPush.priv, { type: 'player:disconnected', playerId: ids[0]! }, ids[0]!, deps);
    expect(disconnected.room.players[ids[0]!]?.connectionStatus).toBe('disconnected');
    expect(disconnected.room.currentAccusation?.initiatorId).toBe(ids[0]!); // ownership never transfers

    const reconnected = sendPlayer(disconnected.room, disconnected.priv, { type: 'player:reconnected', playerId: ids[0]! }, ids[0]!, deps);
    const result = submitAccusation(reconnected.room, reconnected.priv, ids[0]!, hackerIdsOf(reconnected.priv), deps);
    expect(result.rejected).toBeUndefined();
    expect(result.room.phase.state).toBe('ACCUSATION_VOTE');
  });

  it('a voter reconnecting before casting a vote can still vote; reconnecting after voting does not reset it', () => {
    const deps = createTestDeps(1903);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);

    // ids[1] disconnects and reconnects BEFORE voting -> can still vote.
    const disconnected1 = sendPlayer(afterLock.room, afterLock.priv, { type: 'player:disconnected', playerId: ids[1]! }, ids[1]!, deps);
    const reconnected1 = sendPlayer(disconnected1.room, disconnected1.priv, { type: 'player:reconnected', playerId: ids[1]! }, ids[1]!, deps);
    const votedAfterReconnect = submitAccusationVote(reconnected1.room, reconnected1.priv, ids[1]!, 'APPROVE', deps);
    expect(votedAfterReconnect.rejected).toBeUndefined();

    // ids[2] votes, THEN disconnects and reconnects -> vote is untouched, cannot vote again.
    const voted2 = submitAccusationVote(votedAfterReconnect.room, votedAfterReconnect.priv, ids[2]!, 'REJECT', deps);
    const disconnected2 = sendPlayer(voted2.room, voted2.priv, { type: 'player:disconnected', playerId: ids[2]! }, ids[2]!, deps);
    const reconnected2 = sendPlayer(disconnected2.room, disconnected2.priv, { type: 'player:reconnected', playerId: ids[2]! }, ids[2]!, deps);
    expect(reconnected2.room.currentAccusation?.votes[ids[2]!]).toBe('REJECT');
    const revote = submitAccusationVote(reconnected2.room, reconnected2.priv, ids[2]!, 'APPROVE', deps);
    expect(revote.rejected?.code).toBe('DUPLICATE_ACTION');
    expect(revote.room.currentAccusation?.votes[ids[2]!]).toBe('REJECT');
  });

  it('accusation cooldown persists across a disconnect/reconnect cycle', () => {
    const deps = createTestDeps(1905);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    const afterVotes = castAccusationVotes(afterLock.room, afterLock.priv, ids, 'REJECT', deps);
    const cooldownBefore = afterVotes.room.accusationCooldownUntil;
    expect(cooldownBefore).not.toBeNull();

    const disconnected = sendPlayer(afterVotes.room, afterVotes.priv, { type: 'player:disconnected', playerId: ids[0]! }, ids[0]!, deps);
    const reconnected = sendPlayer(disconnected.room, disconnected.priv, { type: 'player:reconnected', playerId: ids[0]! }, ids[0]!, deps);
    expect(reconnected.room.accusationCooldownUntil).toBe(cooldownBefore);

    const stillBlocked = pushButton(reconnected.room, reconnected.priv, ids[0]!, deps);
    expect(stillBlocked.rejected?.code).toBe('ACCUSATION_ON_COOLDOWN');
  });
});

describe('Accusation — crafted/adversarial actions (Part 38)', () => {
  it('a non-existent playerId attempting to push the button is rejected server-side', () => {
    const deps = createTestDeps(2001);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const result = pushButton(atSelect.room, atSelect.priv, 'not-a-real-player', deps);
    expect(result.rejected?.code).toBe('NOT_ELIGIBLE_VOTER');
  });

  it('a stale phaseId on submitAccusation (from before a timeout already cancelled it) is rejected as STALE_PHASE', () => {
    const deps = createTestDeps(2003);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const staleAccusationPhaseId = afterPush.room.phase.phaseId;
    const afterTimeout = expireTimer(afterPush.room, afterPush.priv, deps); // cancelled -> MINIGAME_SELECT
    expect(afterTimeout.room.phase.state).toBe('MINIGAME_SELECT');

    const lateSubmit = sendPlayer(
      afterTimeout.room,
      afterTimeout.priv,
      { type: 'player:submitAccusation', phaseId: staleAccusationPhaseId, playerId: ids[0]!, suspectIds: hackerIdsOf(afterTimeout.priv) },
      ids[0]!,
      deps,
    );
    expect(lateSubmit.rejected?.code).toBe('STALE_PHASE');
  });

  it('a stale phaseId on submitAccusationVote (vote already resolved by timeout) is rejected as STALE_PHASE', () => {
    const deps = createTestDeps(2005);
    const setup = setupRoom(4, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    const staleVotePhaseId = afterLock.room.phase.phaseId;
    const afterTimeout = expireTimer(afterLock.room, afterLock.priv, deps); // resolves (no votes cast) -> rejected -> MINIGAME_SELECT
    expect(afterTimeout.room.phase.state).toBe('MINIGAME_SELECT');

    const lateVote = sendPlayer(
      afterTimeout.room,
      afterTimeout.priv,
      { type: 'player:submitAccusationVote', phaseId: staleVotePhaseId, playerId: ids[1]!, vote: 'APPROVE' },
      ids[1]!,
      deps,
    );
    expect(lateVote.rejected?.code).toBe('STALE_PHASE');
  });

  it('the eligible-voter snapshot is frozen at vote start — a player already in it can still vote even if config would now exclude them', () => {
    const deps = createTestDeps(2007);
    const setup = setupRoom(4, deps, { eliminatedPlayerPolicy: { ...createDefaultConfig().eliminatedPlayerPolicy, canVote: false } });
    const atSelect = driveToAdminSelection(setup, deps);
    const ids = allIds(atSelect.room);
    const afterPush = pushButton(atSelect.room, atSelect.priv, ids[0]!, deps);
    const afterLock = submitAccusation(afterPush.room, afterPush.priv, ids[0]!, hackerIdsOf(afterPush.priv), deps);
    expect(afterLock.room.currentAccusation?.eligibleVoterIds).toHaveLength(4); // everyone alive, so canVote:false makes no difference yet

    // Simulate the snapshotted voter becoming ineligible under a live re-check (e.g. eliminated by
    // an unrelated mechanic) — the snapshot must still let them vote, since §11 requires the
    // eligible-voter list to be fixed at vote start, never live-recalculated.
    const laterState = { ...afterLock.room, players: { ...afterLock.room.players, [ids[3]!]: { ...afterLock.room.players[ids[3]!]!, alive: false } } };
    const voteFromNowIneligible = submitAccusationVote(laterState, afterLock.priv, ids[3]!, 'APPROVE', deps);
    expect(voteFromNowIneligible.rejected).toBeUndefined();
  });
});

describe('Accusation — actor/persistence rehydration (Part 37)', () => {
  it('an evicted-and-reloaded actor mid-accusation-selection preserves the accusation, and the initiator can still submit', async () => {
    const { RoomActor } = await import('../src/actors/room-actor.js');
    const { RoomActorManager } = await import('../src/actors/room-actor-manager.js');
    const { buildRepos } = await import('./helpers/persistence.js');

    const deps = createTestDeps(2101);
    const repos = buildRepos(deps);
    const manager = new RoomActorManager({
      fsmDeps: deps,
      roomStateRepo: repos.roomStateRepo,
      roomPrivateStateRepo: repos.roomPrivateStateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      ttlSeconds: 3600,
    });

    const { createRoom, joinPlayer } = await import('../src/fsm/room-lifecycle.js');
    let created = createRoom(createDefaultConfig(), deps);
    const playerIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = joinPlayer(created.room, created.priv, { name: `P${i}`, avatarId: `a${i}` }, deps);
      if (!res.playerId) throw new Error('join failed');
      created = { room: res.room, priv: res.priv, hostSessionToken: created.hostSessionToken };
      playerIds.push(res.playerId);
    }
    await repos.roomStateRepo.save(created.room, 3600);
    await repos.roomPrivateStateRepo.save(created.priv, 3600);

    const actor = manager.get(created.room.roomId);
    await actor.dispatch({ type: 'host:startGame', phaseId: created.room.phase.phaseId }, { kind: 'host' });
    for (const playerId of playerIds) {
      const snap = actor.getSnapshot()!;
      await actor.dispatch({ type: 'player:acknowledgeReveal', phaseId: snap.room.phase.phaseId, playerId }, { kind: 'player', playerId });
    }
    await actor.dispatch({ type: 'timer:expired', phaseId: actor.getSnapshot()!.room.phase.phaseId }, { kind: 'host' }); // -> MINIGAME_SELECT

    const initiatorId = playerIds[0]!;
    await actor.dispatch({ type: 'player:pushButton', phaseId: actor.getSnapshot()!.room.phase.phaseId, playerId: initiatorId }, { kind: 'player', playerId: initiatorId });
    const beforeEviction = actor.getSnapshot()!;
    expect(beforeEviction.room.phase.state).toBe('ACCUSATION_SELECT');
    expect(beforeEviction.room.currentAccusation?.initiatorId).toBe(initiatorId);

    expect(manager.evictIdle(0)).toEqual([created.room.roomId]);
    expect(manager.has(created.room.roomId)).toBe(false);

    const reloadedActor = manager.get(created.room.roomId);
    const reloaded = await reloadedActor.getOrLoadSnapshot();
    expect(reloaded.room.phase.state).toBe('ACCUSATION_SELECT');
    expect(reloaded.room.currentAccusation?.initiatorId).toBe(initiatorId);
    expect(reloaded.room.currentAccusation?.requiredSuspectCount).toBe(reloaded.room.hackerCount);

    const hackerIds = Object.values(reloaded.priv.players).filter((p) => p.role === 'HACKER').map((p) => p.playerId);
    const result = await reloadedActor.dispatch(
      { type: 'player:submitAccusation', phaseId: reloaded.room.phase.phaseId, playerId: initiatorId, suspectIds: hackerIds },
      { kind: 'player', playerId: initiatorId },
    );
    expect(result.rejected).toBeUndefined();
    expect(result.room.phase.state).toBe('ACCUSATION_VOTE');
  });

  it('an evicted-and-reloaded actor mid-vote preserves already-cast votes and the eligible-voter snapshot', async () => {
    const { RoomActorManager } = await import('../src/actors/room-actor-manager.js');
    const { buildRepos } = await import('./helpers/persistence.js');
    const { createRoom, joinPlayer } = await import('../src/fsm/room-lifecycle.js');

    const deps = createTestDeps(2103);
    const repos = buildRepos(deps);
    const manager = new RoomActorManager({
      fsmDeps: deps,
      roomStateRepo: repos.roomStateRepo,
      roomPrivateStateRepo: repos.roomPrivateStateRepo,
      roomLookupRepo: repos.roomLookupRepo,
      sessionRepo: repos.sessionRepo,
      ttlSeconds: 3600,
    });

    let created = createRoom(createDefaultConfig(), deps);
    const playerIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = joinPlayer(created.room, created.priv, { name: `P${i}`, avatarId: `a${i}` }, deps);
      if (!res.playerId) throw new Error('join failed');
      created = { room: res.room, priv: res.priv, hostSessionToken: created.hostSessionToken };
      playerIds.push(res.playerId);
    }
    await repos.roomStateRepo.save(created.room, 3600);
    await repos.roomPrivateStateRepo.save(created.priv, 3600);

    const actor = manager.get(created.room.roomId);
    await actor.dispatch({ type: 'host:startGame', phaseId: created.room.phase.phaseId }, { kind: 'host' });
    for (const playerId of playerIds) {
      const snap = actor.getSnapshot()!;
      await actor.dispatch({ type: 'player:acknowledgeReveal', phaseId: snap.room.phase.phaseId, playerId }, { kind: 'player', playerId });
    }
    await actor.dispatch({ type: 'timer:expired', phaseId: actor.getSnapshot()!.room.phase.phaseId }, { kind: 'host' }); // -> MINIGAME_SELECT

    const initiatorId = playerIds[0]!;
    await actor.dispatch({ type: 'player:pushButton', phaseId: actor.getSnapshot()!.room.phase.phaseId, playerId: initiatorId }, { kind: 'player', playerId: initiatorId });
    const hackerIds = Object.values(actor.getSnapshot()!.priv.players).filter((p) => p.role === 'HACKER').map((p) => p.playerId);
    await actor.dispatch(
      { type: 'player:submitAccusation', phaseId: actor.getSnapshot()!.room.phase.phaseId, playerId: initiatorId, suspectIds: hackerIds },
      { kind: 'player', playerId: initiatorId },
    );
    await actor.dispatch(
      { type: 'player:submitAccusationVote', phaseId: actor.getSnapshot()!.room.phase.phaseId, playerId: initiatorId, vote: 'APPROVE' },
      { kind: 'player', playerId: initiatorId },
    );
    const beforeEviction = actor.getSnapshot()!;
    expect(beforeEviction.room.currentAccusation?.votes[initiatorId]).toBe('APPROVE');

    expect(manager.evictIdle(0)).toEqual([created.room.roomId]);
    const reloadedActor = manager.get(created.room.roomId);
    const reloaded = await reloadedActor.getOrLoadSnapshot();
    expect(reloaded.room.currentAccusation?.votes[initiatorId]).toBe('APPROVE');
    expect(reloaded.room.currentAccusation?.eligibleVoterIds.sort()).toEqual([...playerIds].sort());

    // A duplicate vote after reload is still rejected — the persisted `currentPhaseSubmissions` map survived too.
    const duplicate = await reloadedActor.dispatch(
      { type: 'player:submitAccusationVote', phaseId: reloaded.room.phase.phaseId, playerId: initiatorId, vote: 'REJECT' },
      { kind: 'player', playerId: initiatorId },
    );
    expect(duplicate.rejected?.code).toBe('DUPLICATE_ACTION');
  });
});
