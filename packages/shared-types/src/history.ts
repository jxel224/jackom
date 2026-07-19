import type { JsonValue } from './json.js';

/** Completed, resolved records only — append-only, never mutated after push (ARCHITECTURE.md §8.5). */
export interface RoundRecord {
  cycle: number;
  roundInCycle: number;
  minigameId: string;
  minigameVersion: string;
  corrupted: boolean;
  /**
   * Whether `corrupted` may be exposed by a view builder for this specific round, computed once
   * at push time from the configured corruptionRevealPolicy and persisted here so the decision
   * survives even after the round leaves `currentRound` (fixes a gap found during implementation
   * where the reveal flag lived only on the ephemeral CurrentRoundState — see ARCHITECTURE.md
   * Revision 3 note under §8.5/§13).
   */
  corruptionRevealed: boolean;
  success: boolean;
  scoreDeltas: Record<string, number>;
  /** Module-defined, safe to persist/display — NOT the raw internal moduleState. */
  resultSummary: JsonValue;
  startedAt: number;
  endedAt: number;
}

export interface SpecialRoundRecord {
  cycle: number;
  participantIds: string[];
  success: boolean;
  scoreDeltas: Record<string, number>;
  resultSummary: JsonValue;
  startedAt: number;
  endedAt: number;
}

export interface VoteRecord {
  cycle: number;
  votes: Record<string, string>;
  eliminatedPlayerId: string | null;
  tie: boolean;
}
