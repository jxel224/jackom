import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { setupRoom } from './helpers/room.js';
import { getEligibleMinigamePlayers, getEligibleSpecialGamePool, getEligibleVoters } from '../src/selectors/players.js';

describe('EliminatedPlayerPolicy', () => {
  it('19a. default policy excludes eliminated players from mini-games, the special game, and voting', () => {
    const deps = createTestDeps(71);
    const setup = setupRoom(6, deps);
    const eliminatedId = setup.playerIds[0]!;
    setup.room.players[eliminatedId]!.alive = false;

    expect(getEligibleMinigamePlayers(setup.room).some((p) => p.playerId === eliminatedId)).toBe(false);
    expect(getEligibleSpecialGamePool(setup.room).some((p) => p.playerId === eliminatedId)).toBe(false);
    expect(getEligibleVoters(setup.room).some((p) => p.playerId === eliminatedId)).toBe(false);

    // Everyone else remains eligible.
    const stillAlive = setup.playerIds.filter((id) => id !== eliminatedId);
    for (const id of stillAlive) {
      expect(getEligibleMinigamePlayers(setup.room).some((p) => p.playerId === id)).toBe(true);
      expect(getEligibleVoters(setup.room).some((p) => p.playerId === id)).toBe(true);
    }
  });

  it('19b. a permissive policy re-includes eliminated players without any FSM code change', () => {
    const deps = createTestDeps(73);
    const setup = setupRoom(6, deps, {
      eliminatedPlayerPolicy: {
        canPlayMinigames: true,
        canBeSelectedForSpecialGame: true,
        canVote: true,
        canDiscuss: true,
        retainsPrivateRoleVisibility: true,
      },
    });
    const eliminatedId = setup.playerIds[0]!;
    setup.room.players[eliminatedId]!.alive = false;

    expect(getEligibleMinigamePlayers(setup.room).some((p) => p.playerId === eliminatedId)).toBe(true);
    expect(getEligibleSpecialGamePool(setup.room).some((p) => p.playerId === eliminatedId)).toBe(true);
    expect(getEligibleVoters(setup.room).some((p) => p.playerId === eliminatedId)).toBe(true);
  });

  it('19c. an eliminated player keeps their own private role info (never revoked)', () => {
    const deps = createTestDeps(79);
    const setup = setupRoom(6, deps);
    const eliminatedId = setup.playerIds[0]!;
    setup.priv.players[eliminatedId]!.role = 'HACKER';
    setup.room.players[eliminatedId]!.alive = false;

    expect(setup.priv.players[eliminatedId]?.role).toBe('HACKER');
  });
});
