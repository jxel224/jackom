import type { PrivatePlayerPayload } from '../shared.js';
import type { RoomPrivateState } from '../types/room-state.js';

/**
 * Unicast-only payload — a player's own role, plus (if a hacker) their fellow hackers. Returns
 * null before role assignment has happened. Never called on behalf of anyone but the owning
 * player's own socket (see ARCHITECTURE.md §8.6 recipient table).
 */
export function buildPrivatePlayerView(priv: RoomPrivateState, playerId: string): PrivatePlayerPayload | null {
  const role = priv.players[playerId]?.role;
  if (!role) return null;

  const fellowHackerIds =
    role === 'HACKER'
      ? Object.values(priv.players)
          .filter((p) => p.role === 'HACKER' && p.playerId !== playerId)
          .map((p) => p.playerId)
      : [];

  return { playerId, role, fellowHackerIds };
}
