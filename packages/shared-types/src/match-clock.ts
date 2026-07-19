import type { JsonValue } from './json.js';
import type { MatchClockMode } from './enums.js';

/** Distinct from per-phase timers (PhaseInfo) — see ARCHITECTURE.md §8.4. */
export interface MatchClock {
  mode: MatchClockMode;
  startedAt: number | null;
  durationMs: number | null;
  /** Accumulated penalty applied so far, for display/audit. */
  penaltyMs: number;
  /** Non-null while paused; final pause/resume semantics are undecided (ARCHITECTURE.md §12). */
  pausedAt: number | null;
}

export interface MatchLogEntry {
  at: number;
  type: 'penalty_applied' | 'firewall_activated' | 'firewall_consumed' | 'special_game_result' | string;
  detail: JsonValue;
}
