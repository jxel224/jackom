import { z } from 'zod';

/**
 * Runtime validation schemas mirroring the shared + server TypeScript types exactly. Every value
 * read back from Redis is parsed through these before the repository layer hands it to the FSM —
 * "all stored values must be valid JSON and validated when loaded" (ARCHITECTURE.md Step 3 scope).
 *
 * Validation error messages intentionally report only zod's `path`/`message` (structural
 * information — "expected string at players.x.role", never the offending value itself), so a
 * corrupted RoomPrivateState document can never leak a session token or role through an error
 * message (see persistence/logging.ts for the same rule applied elsewhere).
 */

// ---- Primitives -------------------------------------------------------------------------------

export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]),
);

const GameStateSchema = z.enum([
  'ROOM_CREATED',
  'LOBBY',
  'ROLE_ASSIGNMENT',
  'ROLE_REVEAL',
  'GAME_INTRO',
  'MINIGAME_SELECT',
  'HACKER_CORRUPTION',
  'MINIGAME_INSTRUCTIONS',
  'MINIGAME_PLAY',
  'RESULTS_REVEAL',
  'DISCUSSION',
  'SPECIAL_GAME_INTRO',
  'SPECIAL_GAME_PLAY',
  'SPECIAL_GAME_RESULT',
  'FINAL_DISCUSSION',
  'VOTING',
  'ELIMINATION_RESULT',
  'FINAL_RESULTS',
  'REMATCH_LOBBY',
  'ABANDONED',
]);

const RoleSchema = z.enum(['CREW', 'HACKER']);
const ConnectionStatusSchema = z.enum(['connected', 'disconnected', 'afk']);
const WinnerSchema = z.union([z.enum(['crew', 'hackers']), z.null()]);
const TieBreakRuleSchema = z.enum(['no_elimination', 'random', 'revote']);
const CorruptionRevealPolicySchema = z.enum(['on_results', 'on_instructions', 'never']);
const SpecialGameInsertionPointSchema = z.enum(['between_rounds', 'end_of_cycle', 'fixed_point']);
const MatchClockModeSchema = z.enum(['disabled', 'countdown']);

// ---- Config -------------------------------------------------------------------------------------

const RoleBalanceConfigSchema = z.object({
  roleBalanceRuleId: z.string(),
  minHackers: z.number(),
  maxHackers: z.number(),
});

const SpecialGameSchedulerConfigSchema = z.object({
  specialGameScheduleRuleId: z.string(),
  specialGameParticipantRuleId: z.string(),
  insertionPoint: SpecialGameInsertionPointSchema,
  minParticipants: z.number(),
  maxParticipants: z.number(),
  failPenaltyMs: z.number(),
});

const MinigameSelectionConfigSchema = z.object({
  minigameSelectionRuleId: z.string(),
});

const CorruptionConfigSchema = z.object({
  aggregationRuleId: z.string(),
});

const EliminatedPlayerPolicySchema = z.object({
  canPlayMinigames: z.boolean(),
  canBeSelectedForSpecialGame: z.boolean(),
  canVote: z.boolean(),
  canDiscuss: z.boolean(),
  retainsPrivateRoleVisibility: z.boolean(),
});

const TimerConfigSchema = z.object({
  roleRevealDurationMs: z.number(),
  introDurationMs: z.number(),
  corruptionWindowMs: z.number(),
  instructionsDurationMs: z.number(),
  resultsDurationMs: z.number(),
  discussionDurationMs: z.number(),
  finalDiscussionDurationMs: z.number(),
  votingDurationMs: z.number(),
  eliminationRevealDurationMs: z.number(),
  specialIntroDurationMs: z.number(),
  specialResultDurationMs: z.number(),
});

const MatchRulesConfigSchema = z.object({
  minPlayers: z.number(),
  maxPlayers: z.number(),
  roundsPerCycle: z.number(),
  maxCycles: z.number(),
  tieBreakRule: TieBreakRuleSchema,
  corruptionRevealPolicy: CorruptionRevealPolicySchema,
  reconnectGraceMs: z.number(),
  hostGraceMs: z.number(),
  afkThresholdMs: z.number(),
});

const RoomConfigSchema = z.object({
  roleBalance: RoleBalanceConfigSchema,
  specialGame: SpecialGameSchedulerConfigSchema,
  minigameSelection: MinigameSelectionConfigSchema,
  corruption: CorruptionConfigSchema,
  eliminatedPlayerPolicy: EliminatedPlayerPolicySchema,
  timers: TimerConfigSchema,
  rules: MatchRulesConfigSchema,
});

// ---- Players / sessions --------------------------------------------------------------------------

const PlayerPublicSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  avatarId: z.string(),
  alive: z.boolean(),
  connectionStatus: ConnectionStatusSchema,
  joinedAt: z.number(),
});

const HostSessionSchema = z.object({
  hostSessionToken: z.string(),
  connectionStatus: ConnectionStatusSchema,
  connectedAt: z.number(),
  lastSeenAt: z.number(),
});

const PlayerPrivateSchema = z.object({
  playerId: z.string(),
  sessionToken: z.string(),
  role: z.union([RoleSchema, z.null()]),
  lastSeenAt: z.number(),
});

// ---- Phase / clock --------------------------------------------------------------------------------

const PhaseInfoSchema = z.object({
  state: GameStateSchema,
  phaseId: z.string(),
  phaseStartedAt: z.number(),
  durationMs: z.union([z.number(), z.null()]),
});

const MatchClockSchema = z.object({
  mode: MatchClockModeSchema,
  startedAt: z.union([z.number(), z.null()]),
  durationMs: z.union([z.number(), z.null()]),
  penaltyMs: z.number(),
  pausedAt: z.union([z.number(), z.null()]),
});

const MatchLogEntrySchema = z.object({
  at: z.number(),
  type: z.string(),
  detail: JsonValueSchema,
});

// ---- Active round / vote state ----------------------------------------------------------------

const CurrentRoundStateSchema = z.object({
  cycle: z.number(),
  roundInCycle: z.number(),
  minigameId: z.string(),
  minigameVersion: z.string(),
  participantIds: z.array(z.string()),
  corrupted: z.boolean(),
  corruptionRevealed: z.boolean(),
  moduleState: JsonValueSchema,
  lastSeq: z.record(z.string(), z.number()),
  recentActionIds: z.record(z.string(), z.array(z.string())),
  startedAt: z.number(),
});

const CurrentSpecialRoundStateSchema = z.object({
  cycle: z.number(),
  participantIds: z.array(z.string()),
  moduleState: JsonValueSchema,
  lastSeq: z.record(z.string(), z.number()),
  recentActionIds: z.record(z.string(), z.array(z.string())),
  startedAt: z.number(),
});

const CurrentVoteStateSchema = z.object({
  cycle: z.number(),
  votes: z.record(z.string(), z.string()),
  startedAt: z.number(),
  revoteOf: z.union([z.array(z.string()), z.null()]),
});

// ---- Completed history ------------------------------------------------------------------------

const RoundRecordSchema = z.object({
  cycle: z.number(),
  roundInCycle: z.number(),
  minigameId: z.string(),
  minigameVersion: z.string(),
  corrupted: z.boolean(),
  corruptionRevealed: z.boolean(),
  success: z.boolean(),
  scoreDeltas: z.record(z.string(), z.number()),
  resultSummary: JsonValueSchema,
  startedAt: z.number(),
  endedAt: z.number(),
});

const SpecialRoundRecordSchema = z.object({
  cycle: z.number(),
  participantIds: z.array(z.string()),
  success: z.boolean(),
  scoreDeltas: z.record(z.string(), z.number()),
  resultSummary: JsonValueSchema,
  startedAt: z.number(),
  endedAt: z.number(),
});

const VoteRecordSchema = z.object({
  cycle: z.number(),
  votes: z.record(z.string(), z.string()),
  eliminatedPlayerId: z.union([z.string(), z.null()]),
  tie: z.boolean(),
});

// ---- Root documents -----------------------------------------------------------------------------

export const RoomStateSchema = z.object({
  roomId: z.string(),
  roomCode: z.string(),
  host: HostSessionSchema,
  config: RoomConfigSchema,
  players: z.record(z.string(), PlayerPublicSchema),
  phase: PhaseInfoSchema,
  cycle: z.number(),
  roundInCycle: z.number(),
  firewallActive: z.boolean(),
  specialGameUsed: z.boolean(),
  winner: WinnerSchema,
  matchClock: MatchClockSchema,
  currentRound: z.union([CurrentRoundStateSchema, z.null()]),
  currentSpecialRound: z.union([CurrentSpecialRoundStateSchema, z.null()]),
  currentVote: z.union([CurrentVoteStateSchema, z.null()]),
  currentPhaseSubmissions: z.record(z.string(), z.boolean()),
  roundHistory: z.array(RoundRecordSchema),
  specialRoundHistory: z.array(SpecialRoundRecordSchema),
  voteHistory: z.array(VoteRecordSchema),
  matchLog: z.array(MatchLogEntrySchema),
  stateVersion: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const RoomPrivateStateSchema = z.object({
  roomId: z.string(),
  players: z.record(z.string(), PlayerPrivateSchema),
  currentCorruptionChoices: z.record(z.string(), z.boolean()),
});
