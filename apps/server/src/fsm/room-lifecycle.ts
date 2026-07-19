import type { RoomConfig } from '../shared.js';
import type { Deps } from '../types/deps.js';
import type { Rejection } from './result.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';
import { getPlayerCount } from '../selectors/players.js';
import { initMatchClock } from './match-clock.js';

/**
 * Room/roster management. These mutate `room.players`/`priv.players` directly and never cause a
 * phase transition (ARCHITECTURE.md §9: "join/leave/setProfile mutate room.players directly, no
 * transition") — phase-transitioning actions (host:startGame, host:closeRoom, host:restartMatch,
 * etc.) live in transitions.ts alongside the rest of handleEvent().
 *
 * Every function here clones its inputs (via structuredClone) before mutating, so callers can
 * treat these as pure: the room/priv passed in is never mutated in place.
 */

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function generateRoomCode(deps: Deps): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(deps.rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export interface CreateRoomResult {
  room: RoomState;
  priv: RoomPrivateState;
  hostSessionToken: string;
}

/**
 * ROOM_CREATED is modeled as instantaneous (ARCHITECTURE.md §3.1: "Exit condition: Immediate") —
 * this returns a room already in LOBBY, with the host session issued and NOT present in `players`.
 */
export function createRoom(config: RoomConfig, deps: Deps): CreateRoomResult {
  const roomId = deps.generateId();
  const hostSessionToken = deps.generateId();
  const now = deps.now();

  const room: RoomState = {
    roomId,
    roomCode: generateRoomCode(deps),
    host: { hostSessionToken, connectionStatus: 'connected', connectedAt: now, lastSeenAt: now },
    config,
    players: {},
    phase: { state: 'LOBBY', phaseId: deps.generateId(), phaseStartedAt: now, durationMs: null },
    cycle: 0,
    roundInCycle: 0,
    firewallActive: false,
    specialGameUsed: false,
    winner: null,
    matchClock: initMatchClock(config),
    currentRound: null,
    currentSpecialRound: null,
    currentVote: null,
    currentPhaseSubmissions: {},
    roundHistory: [],
    specialRoundHistory: [],
    voteHistory: [],
    matchLog: [],
    stateVersion: 0,
    createdAt: now,
    updatedAt: now,
  };

  const priv: RoomPrivateState = { roomId, players: {}, currentCorruptionChoices: {} };

  return { room, priv, hostSessionToken };
}

export interface JoinPlayerResult {
  room: RoomState;
  priv: RoomPrivateState;
  playerId: string | null;
  sessionToken: string | null;
  rejected?: Rejection;
}

export function joinPlayer(
  room: RoomState,
  priv: RoomPrivateState,
  input: { name: string; avatarId: string },
  deps: Deps,
): JoinPlayerResult {
  const nextRoom = structuredClone(room);
  const nextPriv = structuredClone(priv);

  if (nextRoom.phase.state !== 'LOBBY' && nextRoom.phase.state !== 'REMATCH_LOBBY') {
    return { room: nextRoom, priv: nextPriv, playerId: null, sessionToken: null, rejected: { code: 'MATCH_IN_PROGRESS' } };
  }
  if (getPlayerCount(nextRoom) >= nextRoom.config.rules.maxPlayers) {
    return {
      room: nextRoom,
      priv: nextPriv,
      playerId: null,
      sessionToken: null,
      rejected: { code: 'INVALID_PLAYER_COUNT', message: 'Room is already at maxPlayers' },
    };
  }

  const playerId = deps.generateId();
  const sessionToken = deps.generateId();
  const now = deps.now();

  nextRoom.players[playerId] = {
    playerId,
    name: input.name,
    avatarId: input.avatarId,
    alive: true,
    connectionStatus: 'connected',
    joinedAt: now,
  };
  nextPriv.players[playerId] = { playerId, sessionToken, role: null, lastSeenAt: now };
  nextRoom.updatedAt = now;

  return { room: nextRoom, priv: nextPriv, playerId, sessionToken };
}

export interface RoomAndPriv {
  room: RoomState;
  priv: RoomPrivateState;
  rejected?: Rejection;
}

export function leavePlayer(room: RoomState, priv: RoomPrivateState, playerId: string, deps: Deps): RoomAndPriv {
  const nextRoom = structuredClone(room);
  const nextPriv = structuredClone(priv);

  if (nextRoom.phase.state !== 'LOBBY' && nextRoom.phase.state !== 'REMATCH_LOBBY') {
    return { room: nextRoom, priv: nextPriv, rejected: { code: 'MATCH_IN_PROGRESS' } };
  }

  delete nextRoom.players[playerId];
  delete nextPriv.players[playerId];
  nextRoom.updatedAt = deps.now();

  return { room: nextRoom, priv: nextPriv };
}

export function setPlayerProfile(
  room: RoomState,
  priv: RoomPrivateState,
  playerId: string,
  input: { name: string; avatarId: string },
  deps: Deps,
): RoomAndPriv {
  const nextRoom = structuredClone(room);
  const nextPriv = structuredClone(priv);

  if (nextRoom.phase.state !== 'LOBBY') {
    return { room: nextRoom, priv: nextPriv, rejected: { code: 'MATCH_IN_PROGRESS' } };
  }
  const player = nextRoom.players[playerId];
  if (!player) {
    return { room: nextRoom, priv: nextPriv, rejected: { code: 'NOT_PARTICIPANT' } };
  }
  player.name = input.name;
  player.avatarId = input.avatarId;
  nextRoom.updatedAt = deps.now();

  return { room: nextRoom, priv: nextPriv };
}

export function kickPlayer(room: RoomState, priv: RoomPrivateState, targetPlayerId: string, deps: Deps): RoomAndPriv {
  const nextRoom = structuredClone(room);
  const nextPriv = structuredClone(priv);

  if (nextRoom.phase.state !== 'LOBBY') {
    return { room: nextRoom, priv: nextPriv, rejected: { code: 'MATCH_IN_PROGRESS' } };
  }
  delete nextRoom.players[targetPlayerId];
  delete nextPriv.players[targetPlayerId];
  nextRoom.updatedAt = deps.now();

  return { room: nextRoom, priv: nextPriv };
}
