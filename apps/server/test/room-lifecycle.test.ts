import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { castAccusationVotes, driveToAdminSelection, hackerIdsOf, pushButton, setupRoom, startGame, submitAccusation } from './helpers/room.js';
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

    // Drive to FINAL_RESULTS the only way a real match can end early: a resolved Push-the-Button
    // accusation (the legacy periodic elimination vote was retired — see PART 1 of the final
    // gameplay closure). Push the button from MINIGAME_SELECT, correctly nominate the real Hacker
    // set, and have everyone approve.
    const atSelect = driveToAdminSelection(setup, deps);
    let room = atSelect.room;
    let priv = atSelect.priv;
    const hackerIds = hackerIdsOf(priv);
    const initiatorId = setup.playerIds.find((id) => !hackerIds.includes(id)) ?? setup.playerIds[0]!;

    ({ room, priv } = pushButton(room, priv, initiatorId, deps));
    expect(room.phase.state).toBe('ACCUSATION_SELECT');
    ({ room, priv } = submitAccusation(room, priv, initiatorId, hackerIds, deps));
    expect(room.phase.state).toBe('ACCUSATION_VOTE');
    ({ room, priv } = castAccusationVotes(room, priv, setup.playerIds, 'APPROVE', deps));

    expect(room.phase.state).toBe('FINAL_RESULTS');
    expect(room.winner).toBe('crew');

    // FINAL_RESULTS -> REMATCH_LOBBY -> LOBBY via host:restartMatch (a direct shortcut, ARCHITECTURE.md §6/§9.1).
    const restarted = handleEvent(room, priv, { type: 'host:restartMatch' }, { kind: 'host' }, deps);

    expect(restarted.room.phase.state).toBe('LOBBY');
    expect(restarted.room.roomId).toBe(roomId);
    expect(restarted.room.roomCode).toBe(roomCode);
    expect(restarted.room.host.hostSessionToken).toBe(hostToken);
    expect(Object.keys(restarted.room.players).sort()).toEqual(setup.playerIds.sort());
    expect(restarted.room.winner).toBeNull();
    expect(restarted.room.roundHistory).toHaveLength(0);
    expect(restarted.room.accusationHistory).toHaveLength(0);
    for (const playerId of setup.playerIds) {
      expect(restarted.priv.players[playerId]?.role).toBeNull();
      expect(restarted.room.players[playerId]?.alive).toBe(true);
    }
  });

  it('24. the real player-facing rematch button (host:advance then a single host:startGame) starts a genuine new match in one click — not the host:restartMatch shortcut', () => {
    const deps = createTestDeps();
    const setup = setupRoom(5, deps);
    const atSelect = driveToAdminSelection(setup, deps);
    let room = atSelect.room;
    let priv = atSelect.priv;
    const hackerIds = hackerIdsOf(priv);
    const initiatorId = setup.playerIds.find((id) => !hackerIds.includes(id)) ?? setup.playerIds[0]!;

    ({ room, priv } = pushButton(room, priv, initiatorId, deps));
    ({ room, priv } = submitAccusation(room, priv, initiatorId, hackerIds, deps));
    ({ room, priv } = castAccusationVotes(room, priv, setup.playerIds, 'APPROVE', deps));
    expect(room.phase.state).toBe('FINAL_RESULTS');

    // TvFinalResults' one real button: host:advance -> REMATCH_LOBBY (same as production TV code).
    const advanced = handleEvent(room, priv, { type: 'host:advance', phaseId: room.phase.phaseId }, { kind: 'host' }, deps);
    expect(advanced.room.phase.state).toBe('REMATCH_LOBBY');

    // TvLobby's rematch button sends the exact same event LOBBY's own start button sends:
    // host:startGame. A single click must reach ROLE_REVEAL directly — it must NOT dead-end back at
    // a relabelled LOBBY requiring a second, identical-looking click (the real bug PART 5's
    // real-browser Playwright validation caught: the previous handleRematchLobby only reset to
    // LOBBY on this event, silently requiring a second host:startGame to actually begin play).
    const started = handleEvent(advanced.room, advanced.priv, { type: 'host:startGame', phaseId: advanced.room.phase.phaseId }, { kind: 'host' }, deps);
    expect(started.room.phase.state).toBe('ROLE_REVEAL');
    expect(started.room.cycle).toBe(1);
    expect(started.room.winner).toBeNull();
    for (const playerId of setup.playerIds) {
      expect(started.priv.players[playerId]?.role).toMatch(/^(CREW|HACKER)$/);
    }
  });
});
