import type { MatchClock, RoomConfig } from '../shared.js';

/**
 * Default is 'disabled' — whether a persistent main match clock exists at all is still an open
 * design question (ARCHITECTURE.md §12). When disabled, special-game failure penalties are logged
 * to matchLog only, with no gameplay effect.
 */
export function initMatchClock(_config: RoomConfig): MatchClock {
  return {
    mode: 'disabled',
    startedAt: null,
    durationMs: null,
    penaltyMs: 0,
    pausedAt: null,
  };
}
