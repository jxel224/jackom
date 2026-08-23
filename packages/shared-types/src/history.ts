import type { JsonValue } from './json';
import type { AccusationVoteChoice } from './enums';

/** Completed, resolved records only — append-only, never mutated after push (ARCHITECTURE.md §8.5). */
export interface RoundRecord {
  cycle: number;
  roundInCycle: number;
  minigameId: string;
  minigameVersion: string;
  adminId: string;
  hackedPlayerIds: string[];
  /**
   * Whether `hackedPlayerIds` may be exposed by a view builder for this specific round, computed
   * once at push time from the configured corruptionRevealPolicy and persisted here so the
   * decision survives even after the round leaves `currentRound` (see ARCHITECTURE.md Revision 3
   * note under §8.5/§13 — the same gap that motivated this field originally).
   */
  hackedPlayerIdsRevealed: boolean;
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

/** A completed final accusation, resolved either way — see `CurrentAccusationState`. */
export interface AccusationRecord {
  initiatorId: string;
  suspectIds: string[];
  votes: Record<string, AccusationVoteChoice>;
  approved: boolean;
  /** Only meaningful when `approved` — was the accused set exactly the real Hacker set. Null if never approved. */
  correct: boolean | null;
  startedAt: number;
  endedAt: number;
}
