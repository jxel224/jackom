import type { Winner } from '../shared.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';
import { getAlivePlayers } from '../selectors/players.js';
import { isHacker } from './guards.js';

/**
 * Placeholder ratio pending real balancing (ARCHITECTURE.md §12): crew wins once every hacker is
 * eliminated; hackers win once they are numerically >= remaining crew.
 */
export function checkWinCondition(room: RoomState, priv: RoomPrivateState): Winner {
  const alive = getAlivePlayers(room);
  const aliveHackers = alive.filter((p) => isHacker(priv, p.playerId)).length;
  const aliveCrew = alive.length - aliveHackers;

  if (aliveHackers === 0) return 'crew';
  if (aliveHackers >= aliveCrew) return 'hackers';
  return null;
}
