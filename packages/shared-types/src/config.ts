import type { CorruptionRevealPolicy, SpecialGameInsertionPoint } from './enums';

/**
 * Config values that select an *algorithm* are stored as rule-id strings, never as functions,
 * so that RoomConfig stays JSON-serializable and can live in Redis (ARCHITECTURE.md §13 issue #12).
 * The rule bodies themselves are resolved server-side through registries (see apps/server/src/rules).
 */
export interface RoleBalanceConfig {
  roleBalanceRuleId: string;
  minHackers: number;
  maxHackers: number;
}

export interface SpecialGameSchedulerConfig {
  specialGameScheduleRuleId: string;
  specialGameParticipantRuleId: string;
  insertionPoint: SpecialGameInsertionPoint;
  minParticipants: number;
  maxParticipants: number;
  failPenaltyMs: number;
}

export interface MinigameSelectionConfig {
  minigameSelectionRuleId: string;
}

export interface TimerConfig {
  roleRevealDurationMs: number;
  introDurationMs: number;
  /** Duration of the Admin's minigame+participant selection phase (MINIGAME_SELECT). */
  adminSelectionTimeoutMs: number;
  /** Duration the accusation initiator has to lock in a suspect set (ACCUSATION_SELECT) before the accusation is auto-cancelled. */
  accusationSelectionTimeoutMs: number;
  /** Duration of the final-accusation approve/reject vote (ACCUSATION_VOTE). */
  accusationVotingTimeoutMs: number;
  /** Kept under its historical name — see GAMEPLAY_RULES_V1.md §7 naming note. Now the Hacker targeted-hack window's duration, not a "corruption" toggle window. */
  corruptionWindowMs: number;
  instructionsDurationMs: number;
  resultsDurationMs: number;
  discussionDurationMs: number;
  specialIntroDurationMs: number;
  specialResultDurationMs: number;
}

export interface EliminatedPlayerPolicy {
  canPlayMinigames: boolean;
  canBeSelectedForSpecialGame: boolean;
  /** Governs `getEligibleVoters()` — now solely accusation-vote/suspect-nomination eligibility (the legacy per-cycle elimination vote it also used to gate was retired). */
  canVote: boolean;
  canDiscuss: boolean;
  retainsPrivateRoleVisibility: boolean;
}

export interface MatchRulesConfig {
  minPlayers: number;
  maxPlayers: number;
  /**
   * Solely a threshold for `specialGameScheduleRegistry`'s "how many normal rounds before the
   * special game becomes due" rules (e.g. `'placeholder-end-of-cycle-once'`) — NOT an
   * elimination-vote cadence. The legacy periodic elimination vote (FINAL_DISCUSSION/VOTING/
   * ELIMINATION_RESULT) that used to also key off this field was retired as a product decision;
   * the only ways a match now ends are a resolved Push-the-Button accusation or the match clock
   * expiring.
   */
  roundsPerCycle: number;
  /** Governs when a round's hacked-player list becomes visible — see GAMEPLAY_RULES_V1.md §7 naming note. */
  corruptionRevealPolicy: CorruptionRevealPolicy;
  reconnectGraceMs: number;
  hostGraceMs: number;
  afkThresholdMs: number;
  /** Total match clock duration, ms — GAMEPLAY_RULES_V1.md §1/§6. */
  matchClockTotalMs: number;
  /** Whether the Admin may select themselves as a minigame participant — GAMEPLAY_RULES_V1.md §4. */
  adminMaySelectSelf: boolean;
  /** Global cooldown, ms, before another accusation may be initiated after one is rejected — anti-spam. */
  accusationCooldownMs: number;
}

export interface RoomConfig {
  roleBalance: RoleBalanceConfig;
  specialGame: SpecialGameSchedulerConfig;
  minigameSelection: MinigameSelectionConfig;
  eliminatedPlayerPolicy: EliminatedPlayerPolicy;
  timers: TimerConfig;
  rules: MatchRulesConfig;
}
