import type { LastRoundResultSummary, PublicPlayerSummary } from '../shared.js';
import type { RoomState } from '../types/room-state.js';

export function toPublicSummary(player: RoomState['players'][string]): PublicPlayerSummary {
  return {
    playerId: player.playerId,
    name: player.name,
    avatarId: player.avatarId,
    alive: player.alive,
    connectionStatus: player.connectionStatus,
  };
}

export function lastRoundResultFor(room: RoomState): LastRoundResultSummary | null {
  const last = room.roundHistory[room.roundHistory.length - 1];
  if (!last) return null;
  const summary: LastRoundResultSummary = { minigameId: last.minigameId, success: last.success };
  if (last.corruptionRevealed) {
    summary.corrupted = last.corrupted;
  }
  return summary;
}
