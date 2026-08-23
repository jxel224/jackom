import type { FinalRoleReveal, LastRoundResultSummary, PublicPlayerSummary } from '../shared.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';
import { getAllPlayers } from '../selectors/players.js';

export function toPublicSummary(player: RoomState['players'][string]): PublicPlayerSummary {
  return {
    playerId: player.playerId,
    name: player.name,
    avatarId: player.avatarId,
    alive: player.alive,
    connectionStatus: player.connectionStatus,
  };
}

/**
 * Hack targets are completely secret in v1 (Core Logic Phase 1.1 — GAMEPLAY_RULES_V1.md's hack
 * system amendment) — `RoundRecord.hackedPlayerIds`/`hackedPlayerIdsRevealed` exist on `RoomState`
 * for internal debugging/analytics/match-history only and are never read here. `LastRoundResultSummary`
 * has no field capable of holding them, so this is enforced by the type system, not by discipline.
 */
export function lastRoundResultFor(room: RoomState): LastRoundResultSummary | null {
  const last = room.roundHistory[room.roundHistory.length - 1];
  if (!last) return null;
  return { minigameId: last.minigameId, success: last.success };
}

/**
 * Every player's true role, public only once the match has actually ended — gated on
 * `room.winner !== null` (not merely `phase.state === 'FINAL_RESULTS'`) so the reveal also stays
 * visible through `REMATCH_LOBBY`, and stops being true again the instant a real rematch resets
 * `winner` back to null. `priv` is optional (most callers/tests never pass it) — returns null
 * whenever it's absent, exactly like the pre-match-end case, so this is never a silent crash risk
 * for any existing call site.
 */
export function buildFinalReveal(room: RoomState, priv: RoomPrivateState | undefined): FinalRoleReveal[] | null {
  if (room.winner === null || !priv) return null;
  return getAllPlayers(room).map((p) => ({ playerId: p.playerId, role: priv.players[p.playerId]?.role ?? 'CREW' }));
}
