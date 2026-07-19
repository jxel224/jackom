import type { PlayerPublic } from '../shared.js';
import type { RoomState } from '../types/room-state.js';

/**
 * `players` is a Record<string, PlayerPublic>, never an array — these selectors are the ONLY
 * sanctioned way to read it (ARCHITECTURE.md §8.5b, §13 issue #2). Never call `.length` or array
 * methods on `room.players` directly anywhere else in this codebase.
 */

export function getAllPlayers(room: RoomState): PlayerPublic[] {
  return Object.values(room.players);
}

export function getPlayerCount(room: RoomState): number {
  return Object.keys(room.players).length;
}

export function getAlivePlayers(room: RoomState): PlayerPublic[] {
  return getAllPlayers(room).filter((p) => p.alive);
}

export function getConnectedPlayers(room: RoomState): PlayerPublic[] {
  return getAllPlayers(room).filter((p) => p.connectionStatus !== 'disconnected');
}

export function getEligibleMinigamePlayers(room: RoomState): PlayerPublic[] {
  return room.config.eliminatedPlayerPolicy.canPlayMinigames ? getAllPlayers(room) : getAlivePlayers(room);
}

export function getEligibleSpecialGamePool(room: RoomState): PlayerPublic[] {
  return room.config.eliminatedPlayerPolicy.canBeSelectedForSpecialGame ? getAllPlayers(room) : getAlivePlayers(room);
}

export function getEligibleVoters(room: RoomState): PlayerPublic[] {
  return room.config.eliminatedPlayerPolicy.canVote ? getAllPlayers(room) : getAlivePlayers(room);
}
