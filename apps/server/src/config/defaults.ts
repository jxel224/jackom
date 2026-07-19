import type { RoomConfig } from '../shared.js';

/**
 * Default RoomConfig. Every "algorithm" field is a rule-id string; every "value" field is a
 * concrete placeholder number that is explicitly NOT a balancing decision (ARCHITECTURE.md §12).
 */
export function createDefaultConfig(overrides: Partial<RoomConfig> = {}): RoomConfig {
  const base: RoomConfig = {
    roleBalance: {
      roleBalanceRuleId: 'placeholder-linear',
      minHackers: 1,
      maxHackers: 3,
    },
    specialGame: {
      specialGameScheduleRuleId: 'placeholder-end-of-cycle-once',
      specialGameParticipantRuleId: 'placeholder-fixed-four',
      insertionPoint: 'end_of_cycle',
      minParticipants: 3,
      maxParticipants: 5,
      failPenaltyMs: 180_000,
    },
    minigameSelection: {
      minigameSelectionRuleId: 'placeholder-random',
    },
    corruption: {
      aggregationRuleId: 'placeholder-any-corrupts',
    },
    eliminatedPlayerPolicy: {
      canPlayMinigames: false,
      canBeSelectedForSpecialGame: false,
      canVote: false,
      canDiscuss: true,
      retainsPrivateRoleVisibility: true,
    },
    timers: {
      roleRevealDurationMs: 15_000,
      introDurationMs: 10_000,
      corruptionWindowMs: 10_000,
      instructionsDurationMs: 10_000,
      resultsDurationMs: 8_000,
      discussionDurationMs: 60_000,
      finalDiscussionDurationMs: 60_000,
      votingDurationMs: 30_000,
      eliminationRevealDurationMs: 8_000,
      specialIntroDurationMs: 8_000,
      specialResultDurationMs: 8_000,
    },
    rules: {
      minPlayers: 5,
      maxPlayers: 12,
      roundsPerCycle: 2,
      maxCycles: 10,
      tieBreakRule: 'no_elimination',
      corruptionRevealPolicy: 'on_results',
      reconnectGraceMs: 30_000,
      hostGraceMs: 60_000,
      afkThresholdMs: 45_000,
    },
  };

  return {
    ...base,
    ...overrides,
    roleBalance: { ...base.roleBalance, ...overrides.roleBalance },
    specialGame: { ...base.specialGame, ...overrides.specialGame },
    minigameSelection: { ...base.minigameSelection, ...overrides.minigameSelection },
    corruption: { ...base.corruption, ...overrides.corruption },
    eliminatedPlayerPolicy: { ...base.eliminatedPlayerPolicy, ...overrides.eliminatedPlayerPolicy },
    timers: { ...base.timers, ...overrides.timers },
    rules: { ...base.rules, ...overrides.rules },
  };
}
