import type { Deps } from '../types/deps.js';
import type { RoomState } from '../types/room-state.js';
import { randomChoice } from '../fsm/random.js';

/**
 * Server-only rule registries (ARCHITECTURE.md §8.8, §13 issue #12). RoomConfig stores string
 * rule-ids only; these functions are resolved from that id here, server-side, and are never part
 * of RoomConfig/RoomState and never serialized.
 *
 * All the rule BODIES below are explicit placeholders — the balancing/selection decisions are
 * unresolved game design (ARCHITECTURE.md §12), not architecture. Only the rule-id + registry
 * MECHANISM is final. Every rule accepts `deps` (even ones that don't use randomness yet) so no
 * future rule body is ever tempted to reach for Math.random()/Date.now() directly.
 */

export const roleBalanceRegistry: Record<string, (playerCount: number, deps: Deps) => number> = {
  'placeholder-linear': (playerCount) => Math.round(playerCount * 0.25),
};

export const specialGameScheduleRegistry: Record<string, (room: RoomState, deps: Deps) => boolean> = {
  // Fires once, only when the current cycle's regular-round quota has been met.
  'placeholder-end-of-cycle-once': (room) =>
    !room.specialGameUsed && room.roundInCycle >= room.config.rules.roundsPerCycle,
  // Fires once, right after the FIRST regular round of the match (demonstrates insertionPoint: 'between_rounds').
  'placeholder-after-first-round-once': (room) => !room.specialGameUsed && room.roundInCycle >= 1,
  // Never fires — a valid config choice for match variants that skip the special game entirely.
  'placeholder-never': () => false,
};

export const specialGameParticipantRegistry: Record<string, (room: RoomState, deps: Deps) => number> = {
  'placeholder-fixed-four': () => 4,
  'bomb-protocol-scaling': (room) => {
    const count = Object.keys(room.players).length;
    return count <= 5 ? 3 : count <= 7 ? 4 : 5;
  },
};

/**
 * 'placeholder-random' picks uniformly among whatever candidate minigame ids the caller (the
 * MINIGAME_SELECT transition handler) knows are currently registered — kept as a parameter rather
 * than importing minigames/registry.ts here to avoid a circular import between the two registry
 * modules. Only one concrete id (the generic placeholder) exists today; the rule body is otherwise
 * a real, generically-correct "pick one of N" implementation.
 */
/**
 * Only used as the Admin-selection TIMEOUT fallback now (GAMEPLAY_RULES_V1.md §5) — the Admin
 * chooses explicitly in the normal path. Kept as a registry (not inlined) so the fallback rule
 * itself stays swappable independent of the timeout-handling code that invokes it.
 */
export const minigameSelectionRegistry: Record<string, (room: RoomState, deps: Deps, availableIds: string[]) => string> = {
  'placeholder-random': (_room, deps, availableIds) => randomChoice(availableIds, deps.rng),
  'rank-it-only': () => 'RANK_IT',
  'complete-it-only': () => 'COMPLETE_IT',
  'predict-them-only': () => 'PREDICT_THEM',
  'draw-it-only': () => 'DRAW_IT',
  'describe-it-only': () => 'DESCRIBE_IT',
  'defend-it-only': () => 'DEFEND_IT',
};
