import type { JsonValue } from './json';
import type { AccusationVoteChoice, GameState } from './enums';

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
  /** Who selected this round's minigame/participants (GAMEPLAY_RULES_V1.md §4). */
  adminId: string;
  /** Exactly what the Admin submitted, before any per-minigame expansion (e.g. Predict Them's audience). */
  adminSelectedParticipantIds: string[];
  /** Final FSM-level participant set — who may act during MINIGAME_PLAY. */
  participantIds: string[];
  /** Targets successfully hacked this round (GAMEPLAY_RULES_V1.md §7). Authoritative; server-private until corruptionRevealPolicy says otherwise. */
  hackedPlayerIds: string[];
  /** hackerId -> whether they've already used their one accepted action this round. */
  hackerActionsUsed: Record<string, boolean>;
  /**
   * Set true the moment the configured corruptionRevealPolicy says clients may see
   * `hackedPlayerIds` for THIS round (either right after HACKER_CORRUPTION resolves, for
   * 'on_instructions', or at MINIGAME_PLAY exit, for 'on_results'). Copied onto the completed
   * RoundRecord at push time so the reveal decision survives after currentRound is cleared.
   */
  hackedPlayerIdsRevealed: boolean;
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

/**
 * The Crew's final accusation (Core Logic Phase 2A — GAMEPLAY_RULES_V1.md's accusation system
 * section) — the ONE final-result mechanic in the game. The older per-cycle elimination vote this
 * comment used to distinguish itself from (`CurrentVoteState`) was retired as a product decision.
 */
export interface CurrentAccusationState {
  initiatorId: string;
  /** Equal to the match's public hackerCount at the moment the accusation was pushed. */
  requiredSuspectCount: number;
  /** Null while the initiator is still choosing (ACCUSATION_SELECT); locked once voting begins. */
  suspectIds: string[] | null;
  /** Snapshotted the instant voting begins — fixed for the whole vote, never recalculated from live connection state. */
  eligibleVoterIds: string[];
  /** voterId -> their choice. Internal; never serialized directly into any view (aggregate counts only). */
  votes: Record<string, AccusationVoteChoice>;
  /**
   * Which phase this accusation interrupted — governs how a rejected/cancelled accusation returns:
   * from MINIGAME_SELECT, the same interrupted Admin turn resumes untouched; from DISCUSSION, play
   * proceeds normally into the next round's MINIGAME_SELECT (fresh Admin rotation included).
   */
  originState: Extract<GameState, 'DISCUSSION' | 'MINIGAME_SELECT'>;
  startedAt: number;
}
