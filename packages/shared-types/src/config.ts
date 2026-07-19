import type { CorruptionRevealPolicy, SpecialGameInsertionPoint, TieBreakRule } from './enums.js';

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

export interface CorruptionConfig {
  aggregationRuleId: string;
}

export interface TimerConfig {
  roleRevealDurationMs: number;
  introDurationMs: number;
  corruptionWindowMs: number;
  instructionsDurationMs: number;
  resultsDurationMs: number;
  discussionDurationMs: number;
  finalDiscussionDurationMs: number;
  votingDurationMs: number;
  eliminationRevealDurationMs: number;
  specialIntroDurationMs: number;
  specialResultDurationMs: number;
}

export interface EliminatedPlayerPolicy {
  canPlayMinigames: boolean;
  canBeSelectedForSpecialGame: boolean;
  canVote: boolean;
  canDiscuss: boolean;
  retainsPrivateRoleVisibility: boolean;
}

export interface MatchRulesConfig {
  minPlayers: number;
  maxPlayers: number;
  roundsPerCycle: number;
  maxCycles: number;
  tieBreakRule: TieBreakRule;
  corruptionRevealPolicy: CorruptionRevealPolicy;
  reconnectGraceMs: number;
  hostGraceMs: number;
  afkThresholdMs: number;
}

export interface RoomConfig {
  roleBalance: RoleBalanceConfig;
  specialGame: SpecialGameSchedulerConfig;
  minigameSelection: MinigameSelectionConfig;
  corruption: CorruptionConfig;
  eliminatedPlayerPolicy: EliminatedPlayerPolicy;
  timers: TimerConfig;
  rules: MatchRulesConfig;
}
