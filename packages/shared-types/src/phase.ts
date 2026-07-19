import type { GameState } from './enums.js';

export interface PhaseInfo {
  state: GameState;
  /** Unique per phase entry. Used for staleness checks — every inbound action must target the current phaseId. */
  phaseId: string;
  /** Epoch ms, server clock. */
  phaseStartedAt: number;
  /** null = host-paced, no auto-expiry. */
  durationMs: number | null;
}
