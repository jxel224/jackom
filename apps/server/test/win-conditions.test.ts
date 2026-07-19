import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { driveToVoting, sendHost, sendPlayer, setupRoom } from './helpers/room.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import { checkWinCondition } from '../src/fsm/win-condition.js';

const NO_SPECIAL_GAME = { specialGame: { ...createDefaultConfig().specialGame, specialGameScheduleRuleId: 'placeholder-never' } };

describe('checkWinCondition (unit)', () => {
  it('22a. crew wins once every hacker is eliminated', () => {
    const deps = createTestDeps(109);
    const setup = setupRoom(5, deps, NO_SPECIAL_GAME);
    for (const id of setup.playerIds) {
      setup.priv.players[id]!.role = 'CREW';
    }
    setup.priv.players[setup.playerIds[0]!]!.role = 'HACKER';
    setup.room.players[setup.playerIds[0]!]!.alive = false; // the only hacker is dead

    expect(checkWinCondition(setup.room, setup.priv)).toBe('crew');
  });

  it('22b. hackers win once they are numerically >= remaining crew', () => {
    const deps = createTestDeps(113);
    const setup = setupRoom(5, deps, NO_SPECIAL_GAME);
    // 2 hackers, 3 crew initially; eliminate crew down to 2 so hackers (2) >= crew (2).
    setup.priv.players[setup.playerIds[0]!]!.role = 'HACKER';
    setup.priv.players[setup.playerIds[1]!]!.role = 'HACKER';
    setup.priv.players[setup.playerIds[2]!]!.role = 'CREW';
    setup.priv.players[setup.playerIds[3]!]!.role = 'CREW';
    setup.priv.players[setup.playerIds[4]!]!.role = 'CREW';
    setup.room.players[setup.playerIds[2]!]!.alive = false;

    expect(checkWinCondition(setup.room, setup.priv)).toBe('hackers');
  });

  it('22c. no winner yet while hackers remain outnumbered', () => {
    const deps = createTestDeps(127);
    const setup = setupRoom(5, deps, NO_SPECIAL_GAME);
    setup.priv.players[setup.playerIds[0]!]!.role = 'HACKER';
    for (const id of setup.playerIds.slice(1)) {
      setup.priv.players[id]!.role = 'CREW';
    }

    expect(checkWinCondition(setup.room, setup.priv)).toBeNull();
  });
});

describe('Win condition drives the FSM to FINAL_RESULTS', () => {
  it('22d. eliminating the last hacker via a real vote ends the match with winner "crew"', () => {
    const deps = createTestDeps(131);
    const setup = setupRoom(5, deps, { ...NO_SPECIAL_GAME, rules: { ...createDefaultConfig().rules, minPlayers: 5, maxCycles: 20 } });
    const atVoting = driveToVoting(setup, deps);

    // Force a single-hacker scenario directly on the driven room (white-box), then vote them out.
    const hackerId = Object.values(atVoting.priv.players).find((p) => p.role === 'HACKER')?.playerId;
    for (const id of Object.keys(atVoting.priv.players)) {
      atVoting.priv.players[id]!.role = id === hackerId ? 'HACKER' : 'CREW';
    }
    expect(hackerId).toBeDefined();

    let room = atVoting.room;
    let priv = atVoting.priv;
    for (const voterId of setup.playerIds) {
      const res = sendPlayer(room, priv, { type: 'player:submitVote', phaseId: room.phase.phaseId, playerId: voterId, targetPlayerId: hackerId! }, voterId, deps);
      room = res.room;
      priv = res.priv;
    }
    expect(room.phase.state).toBe('ELIMINATION_RESULT');

    const resolved = sendHost(room, priv, { type: 'host:advance', phaseId: room.phase.phaseId }, deps);

    expect(resolved.room.phase.state).toBe('FINAL_RESULTS');
    expect(resolved.room.winner).toBe('crew');
  });
});
