import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, driveToVoting, hackerIdsOf, sendPlayer, setupRoom, startGame } from './helpers/room.js';
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

    const atVoting = driveToVoting(setup, deps);
    checkpoints.push(atVoting);
    const voter = setup.playerIds[0]!;
    const votedResult = sendPlayer(atVoting.room, atVoting.priv, { type: 'player:submitVote', phaseId: atVoting.room.phase.phaseId, playerId: voter, targetPlayerId: setup.playerIds[1]! }, voter, deps);
    checkpoints.push(votedResult);

    for (const { room, priv } of checkpoints) {
      const tv = buildTvView(room);
      const tvJson = JSON.stringify(tv);
      expect(tvJson).not.toContain('"role"');
      expect(tvJson).not.toContain('HACKER');
      for (const token of sessionTokens) expect(tvJson).not.toContain(token);
      expect(tvJson).not.toContain(hostToken);

      for (const playerId of setup.playerIds) {
        const pv = buildPlayerView(room, priv, playerId);
        const pvJson = JSON.stringify(pv);
        expect(pvJson).not.toContain('"role"');
        expect(pvJson).not.toContain('HACKER');
        for (const token of sessionTokens) expect(pvJson).not.toContain(token);
        expect(pvJson).not.toContain(hostToken);
        // Every OTHER player's individual vote must not appear verbatim in this player's own view.
        if (room.currentVote) {
          for (const [otherVoter, target] of Object.entries(room.currentVote.votes)) {
            if (otherVoter === playerId) continue;
            expect(pvJson).not.toContain(`"${otherVoter}":"${target}"`);
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
});
