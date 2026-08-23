import type { GameState } from '../shared.js';

/**
 * The only states `player:pushButton` may legally be sent from (Core Logic Phase 2A). Centralized
 * here — imported by both the FSM transition handler and the player-view builder's `canPushButton`
 * advisory flag — so the policy of "which states allow an accusation" lives in exactly one place,
 * never duplicated/scattered across handlers.
 */
export const ACCUSATION_ALLOWED_STATES: ReadonlySet<GameState> = new Set(['DISCUSSION', 'MINIGAME_SELECT']);
