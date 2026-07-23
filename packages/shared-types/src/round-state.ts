import type { JsonValue } from './json';

/**
 * Active (in-progress) round/vote state, kept separate from completed history records
 * (ARCHITECTURE.md §8.5, §13 issue #1). These are nullable top-level fields on RoomState —
 * whatever is "currently happening" lives here, never as a half-finished entry in a history array.
 */
export interface CurrentRoundState {
  cycle: number;
  roundInCycle: number;
  minigameId: string;
  minigameVersion: string;
  participantIds: string[];
  /** Authoritative; server-private until corruptionRevealPolicy says otherwise. */
  corrupted: boolean;
  /**
   * Set true the moment the configured corruptionRevealPolicy says clients may see `corrupted`
   * for THIS round (either right after HACKER_CORRUPTION resolves, for 'on_instructions', or at
   * MINIGAME_PLAY exit, for 'on_results'). Copied onto the completed RoundRecord at push time so
   * the reveal decision survives after currentRound is cleared (see RoundRecord below).
   */
  corruptionRevealed: boolean;
  /** Opaque to the FSM, owned by MiniGameModule.start()/handleAction(). */
  moduleState: JsonValue;
  /** playerId -> highest accepted seq, for multi-action ordering. */
  lastSeq: Record<string, number>;
  /** playerId -> bounded ring buffer of actionIds, for retry dedup. */
  recentActionIds: Record<string, string[]>;
  startedAt: number;
}

export interface CurrentSpecialRoundState {
  cycle: number;
  participantIds: string[];
  moduleState: JsonValue;
  lastSeq: Record<string, number>;
  recentActionIds: Record<string, string[]>;
  startedAt: number;
}

export interface CurrentVoteState {
  cycle: number;
  votes: Record<string /* voterId */, string /* targetId | 'skip' */>;
  startedAt: number;
  /**
   * Non-null only while re-voting after a tie under the 'revote' tie-break rule: holds the
   * tied target ids that this revote is restricted to. null on a normal (first-attempt) vote.
   * This is an additive field beyond the original architecture draft, needed to implement the
   * 'revote' rule concretely (bounded to one revote attempt, see apps/server/src/voting/tally.ts).
   */
  revoteOf: string[] | null;
}
