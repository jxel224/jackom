import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, setupRoom, startGame } from './helpers/room.js';
import { createRoom, joinPlayer } from '../src/fsm/room-lifecycle.js';
import { handleEvent } from '../src/fsm/transitions.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import { getPlayerCount } from '../src/selectors/players.js';

describe('Room initialization', () => {
  it('1. creates a room already in LOBBY', () => {
    const deps = createTestDeps();
    const { room } = createRoom(createDefaultConfig(), deps);

    expect(room.phase.state).toBe('LOBBY');
    expect(Object.keys(room.players)).toHaveLength(0);
    expect(room.roomCode).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('2. the host is never counted as a player', () => {
    const deps = createTestDeps();
    const { room, hostSessionToken } = createRoom(createDefaultConfig(), deps);

    expect(getPlayerCount(room)).toBe(0);
    expect(room.host.hostSessionToken).toBe(hostSessionToken);
    // The host session token must never collide with a playerId, and no player row exists for it.
    expect(room.players[hostSessionToken]).toBeUndefined();

    const deps2 = createTestDeps(2);
    const created2 = createRoom(createDefaultConfig(), deps2);
    let withPlayers = created2.room;
    let withPlayersPriv = created2.priv;
    for (let i = 0; i < 3; i++) {
      const res = joinPlayer(withPlayers, withPlayersPriv, { name: `P${i}`, avatarId: 'a' }, deps2);
      withPlayers = res.room;
      withPlayersPriv = res.priv;
    }
    expect(getPlayerCount(withPlayers)).toBe(3);
    // The host is still not a player row after others join.
    expect(withPlayers.players[created2.hostSessionToken]).toBeUndefined();
  });
});

describe('Starting a match', () => {
  it('3. cannot start below the configured minimum player count', () => {
    const deps = createTestDeps();
    const setup = setupRoom(2, deps, { rules: { ...createDefaultConfig().rules, minPlayers: 5, maxPlayers: 12 } });

    const result = startGame(setup.room, setup.priv, deps);

    expect(result.rejected?.code).toBe('INVALID_PLAYER_COUNT');
    expect(result.room.phase.state).toBe('LOBBY');
  });

  it('4. a valid start assigns roles and lands on ROLE_REVEAL (ROLE_ASSIGNMENT is instantaneous)', () => {
    const deps = createTestDeps();
    const setup = setupRoom(6, deps);

    const result = startGame(setup.room, setup.priv, deps);

    expect(result.rejected).toBeUndefined();
    expect(result.room.phase.state).toBe('ROLE_REVEAL');
    expect(result.room.cycle).toBe(1);
    for (const playerId of setup.playerIds) {
      expect(result.priv.players[playerId]?.role).toMatch(/^(CREW|HACKER)$/);
    }
  });
});

describe('Rematch', () => {
  it('23. resets match state but keeps the room, host session, and player roster', () => {
    const deps = createTestDeps();
    const setup = setupRoom(5, deps);
    const hostToken = setup.room.host.hostSessionToken;
    const roomId = setup.room.roomId;
    const roomCode = setup.room.roomCode;

    // Drive to FINAL_RESULTS by forcing a crew win: eliminate every hacker one at a time.
    let { room, priv } = startGame(setup.room, setup.priv, deps);
    ({ room, priv } = ackAllReveals(room, priv, setup.playerIds, deps));
    ({ room, priv } = expireTimer(room, priv, deps)); // GAME_INTRO -> ... -> HACKER_CORRUPTION
    ({ room, priv } = expireTimer(room, priv, deps)); // HACKER_CORRUPTION -> MINIGAME_INSTRUCTIONS
    ({ room, priv } = expireTimer(room, priv, deps)); // -> MINIGAME_PLAY
    ({ room, priv } = expireTimer(room, priv, deps)); // -> RESULTS_REVEAL
    ({ room, priv } = expireTimer(room, priv, deps)); // -> DISCUSSION
    ({ room, priv } = expireTimer(room, priv, deps)); // -> FINAL_DISCUSSION (roundsPerCycle default 2, but special game may trigger; drive generically)

    // Regardless of the exact path, keep expiring timers / advancing until we hit FINAL_RESULTS or run out of budget.
    for (let i = 0; i < 40 && room.phase.state !== 'FINAL_RESULTS'; i++) {
      if (room.phase.state === 'VOTING') {
        // Vote out a hacker if any remain, else skip.
        const hackerId = Object.values(priv.players).find((p) => p.role === 'HACKER' && room.players[p.playerId]?.alive)?.playerId;
        const target = hackerId ?? 'skip';
        for (const voterId of setup.playerIds) {
          if (!room.players[voterId]?.alive) continue;
          const res = handleEvent(
            room,
            priv,
            { type: 'player:submitVote', phaseId: room.phase.phaseId, playerId: voterId, targetPlayerId: target },
            { kind: 'player', playerId: voterId },
            deps,
          );
          room = res.room;
          priv = res.priv;
        }
      }
      const res = expireTimer(room, priv, deps);
      room = res.room;
      priv = res.priv;
    }

    expect(room.phase.state).toBe('FINAL_RESULTS');

    // FINAL_RESULTS -> REMATCH_LOBBY -> LOBBY via host:restartMatch (a direct shortcut, ARCHITECTURE.md §6/§9.1).
    const restarted = handleEvent(room, priv, { type: 'host:restartMatch' }, { kind: 'host' }, deps);

    expect(restarted.room.phase.state).toBe('LOBBY');
    expect(restarted.room.roomId).toBe(roomId);
    expect(restarted.room.roomCode).toBe(roomCode);
    expect(restarted.room.host.hostSessionToken).toBe(hostToken);
    expect(Object.keys(restarted.room.players).sort()).toEqual(setup.playerIds.sort());
    expect(restarted.room.winner).toBeNull();
    expect(restarted.room.roundHistory).toHaveLength(0);
    expect(restarted.room.voteHistory).toHaveLength(0);
    for (const playerId of setup.playerIds) {
      expect(restarted.priv.players[playerId]?.role).toBeNull();
      expect(restarted.room.players[playerId]?.alive).toBe(true);
    }
  });
});
