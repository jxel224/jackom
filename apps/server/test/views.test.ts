import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { handleEvent } from '../src/fsm/transitions.js';
import {
  ackAllReveals, castAccusationVotes, driveToDiscussion, hackerIdsOf, pushButton, setupRoom, startGame, submitAccusation, submitAccusationVote,
} from './helpers/room.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import { buildPrivatePlayerView } from '../src/views/build-private-player-view.js';

const NO_SPECIAL_GAME = { specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-never' } };

describe('View projections never leak private data', () => {
  it('25a. TvView and PlayerView never contain session tokens, roles, or vote content, across every phase', () => {
    const deps = createTestDeps(167);
    const setup = setupRoom(6, deps, NO_SPECIAL_GAME);
    const sessionTokens = Object.values(setup.priv.players).map((p) => p.sessionToken);
    const hostToken = setup.room.host.hostSessionToken;

    const checkpoints: Array<{ room: typeof setup.room; priv: typeof setup.priv }> = [];
    checkpoints.push({ room: setup.room, priv: setup.priv });

    const started = startGame(setup.room, setup.priv, deps);
    checkpoints.push(started);

    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    checkpoints.push(acked);

    const atDiscussion = driveToDiscussion(setup, deps);
    checkpoints.push(atDiscussion);

    // The one remaining final-result mechanic (the legacy per-cycle elimination vote was retired) —
    // push the button and cast real accusation votes, checking individual votes never leak either.
    const initiatorId = setup.playerIds.find((id) => !hackerIdsOf(atDiscussion.priv).includes(id))!;
    const pushed = pushButton(atDiscussion.room, atDiscussion.priv, initiatorId, deps);
    checkpoints.push(pushed);
    const votedResult = submitAccusationVote(pushed.room, pushed.priv, setup.playerIds[0]!, 'REJECT', deps);
    checkpoints.push(votedResult);

    for (const { room, priv } of checkpoints) {
      const tv = buildTvView(room);
      const tvJson = JSON.stringify(tv);
      expect(tvJson).not.toContain('"role"');
      expect(tvJson).not.toContain('HACKER');
      // Exact-value match (quoted), not bare substring containment — sequential deterministic test
      // ids ("id-5" vs "id-53") can otherwise collide as substrings without any real token leaking.
      for (const token of sessionTokens) expect(tvJson).not.toContain(`"${token}"`);
      expect(tvJson).not.toContain(`"${hostToken}"`);

      for (const playerId of setup.playerIds) {
        const pv = buildPlayerView(room, priv, playerId);
        const pvJson = JSON.stringify(pv);
        expect(pvJson).not.toContain('"role"');
        expect(pvJson).not.toContain('HACKER');
        for (const token of sessionTokens) expect(pvJson).not.toContain(`"${token}"`);
        expect(pvJson).not.toContain(`"${hostToken}"`);
        // Every OTHER player's individual accusation vote must not appear verbatim in this player's own view.
        if (room.currentAccusation) {
          for (const [otherVoter, vote] of Object.entries(room.currentAccusation.votes)) {
            if (otherVoter === playerId) continue;
            expect(pvJson).not.toContain(`"${otherVoter}":"${vote}"`);
          }
        }
      }
    }
  });

  it('25b. PrivatePlayerPayload legitimately carries the role, but ONLY for its own player, and hides fellow hackers from crew', () => {
    const deps = createTestDeps(173);
    const setup = setupRoom(7, deps, NO_SPECIAL_GAME);
    const started = startGame(setup.room, setup.priv, deps);
    const hackerIds = hackerIdsOf(started.priv);
    const crewIds = setup.playerIds.filter((id) => !hackerIds.includes(id));

    for (const hackerId of hackerIds) {
      const view = buildPrivatePlayerView(started.priv, hackerId);
      expect(view?.role).toBe('HACKER');
      expect(view?.fellowHackerIds.sort()).toEqual(hackerIds.filter((id) => id !== hackerId).sort());
    }
    for (const crewId of crewIds) {
      const view = buildPrivatePlayerView(started.priv, crewId);
      expect(view?.role).toBe('CREW');
      expect(view?.fellowHackerIds).toEqual([]);
    }
  });

  it('25c. returns null before any role has been assigned', () => {
    const deps = createTestDeps(179);
    const setup = setupRoom(5, deps);

    const view = buildPrivatePlayerView(setup.priv, setup.playerIds[0]!);

    expect(view).toBeNull();
  });

  it('26. FINAL_RESULTS publicly reveals every real role to TV and to every player — impossible before the match ends, and hidden again after a rematch (Final Gameplay Closure PART 4)', () => {
    const deps = createTestDeps(311);
    const setup = setupRoom(6, deps, NO_SPECIAL_GAME);
    const atDiscussion = driveToDiscussion(setup, deps);
    const realHackerIds = hackerIdsOf(atDiscussion.priv).sort();

    // Before the match ends, finalReveal must be null everywhere — even though buildTvView/
    // buildPlayerView are handed the real `priv` (i.e. this is gated on room.winner, not merely on
    // whether the caller happens to have access to private state).
    expect(buildTvView(atDiscussion.room, atDiscussion.priv).finalReveal).toBeNull();
    for (const playerId of setup.playerIds) {
      expect(buildPlayerView(atDiscussion.room, atDiscussion.priv, playerId).finalReveal).toBeNull();
    }

    // Push the button, correctly accuse the exact real Hacker set, and unanimously approve —
    // the sole way (post-legacy-voting-retirement) a match resolves to FINAL_RESULTS with a winner.
    const initiatorId = setup.playerIds.find((id) => !realHackerIds.includes(id))!;
    const pushed = pushButton(atDiscussion.room, atDiscussion.priv, initiatorId, deps);
    const accused = submitAccusation(pushed.room, pushed.priv, initiatorId, realHackerIds, deps);
    const resolved = castAccusationVotes(accused.room, accused.priv, setup.playerIds, 'APPROVE', deps);

    expect(resolved.room.phase.state).toBe('FINAL_RESULTS');
    expect(resolved.room.winner).toBe('crew');

    const expectedReveal = setup.playerIds
      .map((playerId) => ({ playerId, role: resolved.priv.players[playerId]!.role }))
      .sort((a, b) => a.playerId.localeCompare(b.playerId));

    const tvReveal = buildTvView(resolved.room, resolved.priv).finalReveal;
    expect(tvReveal?.slice().sort((a, b) => a.playerId.localeCompare(b.playerId))).toEqual(expectedReveal);
    expect(tvReveal!.some((entry) => entry.role === 'HACKER')).toBe(true); // the reveal is genuinely there, not vacuously empty

    // Every player — Hacker and Crew alike — receives the FULL reveal (every player's role), not
    // merely their own; that's what makes it a "reveal" rather than the ordinary private self-view.
    for (const playerId of setup.playerIds) {
      const pvReveal = buildPlayerView(resolved.room, resolved.priv, playerId).finalReveal;
      expect(pvReveal?.slice().sort((a, b) => a.playerId.localeCompare(b.playerId))).toEqual(expectedReveal);
    }

    // A real rematch resets `winner` to null — the reveal must become impossible again immediately,
    // not linger from the previous match.
    const restarted = handleEvent(resolved.room, resolved.priv, { type: 'host:restartMatch' }, { kind: 'host' }, deps);
    expect(restarted.room.winner).toBeNull();
    expect(buildTvView(restarted.room, restarted.priv).finalReveal).toBeNull();
    for (const playerId of setup.playerIds) {
      expect(buildPlayerView(restarted.room, restarted.priv, playerId).finalReveal).toBeNull();
    }
  });
});
