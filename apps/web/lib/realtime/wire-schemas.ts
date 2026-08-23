import { z } from 'zod';

/**
 * Small, dedicated frontend validation schemas for the WebSocket gateway's wire format
 * (ARCHITECTURE.md Step 4 / apps/server/src/gateway/schemas.ts's `WireMessageSchema`, mirrored
 * here rather than imported — the server-side schema table also validates INBOUND client→server
 * FSM event payloads, which this client never needs; keeping a separate, minimal, frontend-owned
 * copy avoids a zod cross-package dependency question for zero real benefit).
 *
 * Every field a real gameplay component now reads (Admin selection, Hacker targeting, push-button,
 * accusation/voting, final role reveal, match clock, minigame views) is validated with its real
 * shape below, not `z.unknown()` — a component built to render one of these can now trust the
 * parsed value rather than re-deriving structural guarantees the server already provides.
 * `minigameView`/`currentMinigame.tvView`/`currentSpecialGame.tvView` stay `z.unknown()`
 * deliberately: their shape is module-specific (owned by each minigame's own server module), and
 * each minigame component narrows it itself via `view-data.ts`'s helpers, the same pattern
 * `PlayerRateIt`/`TvRateIt` already established.
 */

export const WireEnvelopeSchema = z.object({
  type: z.string().min(1),
  requestId: z.string().nullable().optional(),
  payload: z.unknown(),
});

export const ErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const HostAuthenticatedPayloadSchema = z.object({
  roomId: z.string(),
});

export const PlayerReconnectedAckPayloadSchema = z.object({
  playerId: z.string(),
});

const PhaseInfoSchema = z.object({
  state: z.string(),
  phaseId: z.string(),
  phaseStartedAt: z.number(),
  durationMs: z.number().nullable(),
});

const PublicPlayerSummarySchema = z.object({
  playerId: z.string(),
  name: z.string(),
  avatarId: z.string(),
  alive: z.boolean(),
  connectionStatus: z.enum(['connected', 'disconnected', 'afk']),
});

const MatchClockSchema = z.object({
  status: z.enum(['pending', 'running', 'paused', 'stopped']),
  clockId: z.string(),
  startedAt: z.number().nullable(),
  deadlineAt: z.number().nullable(),
  remainingMs: z.number(),
  totalPenaltyMs: z.number(),
});

const AdminSelectionInfoSchema = z.object({
  availableMinigameIds: z.array(z.string()),
  participantLimits: z.record(z.string(), z.object({ min: z.number(), max: z.number() })),
  eligiblePlayerIds: z.array(z.string()),
});

const HackerPlayerInfoSchema = z.object({
  hacksRemaining: z.number(),
  canHackNow: z.boolean(),
  eligibleTargetIds: z.array(z.string()),
});

const AccusationPublicViewSchema = z.object({
  initiatorId: z.string(),
  requiredSuspectCount: z.number(),
  suspectIds: z.array(z.string()).nullable(),
  votedCount: z.number().nullable(),
  totalEligible: z.number().nullable(),
});

const PlayerAccusationInfoSchema = AccusationPublicViewSchema.extend({
  isInitiator: z.boolean(),
  eligibleSuspectIds: z.array(z.string()).nullable(),
  hasVoted: z.boolean(),
});

const FinalRoleRevealSchema = z.array(z.object({ playerId: z.string(), role: z.enum(['CREW', 'HACKER']) })).nullable();

const WinnerSchema = z.enum(['crew', 'hackers']).nullable();

const LastRoundResultSchema = z.object({ minigameId: z.string(), success: z.boolean() }).nullable();

export const TvViewPayloadSchema = z
  .object({
    roomCode: z.string(),
    phase: PhaseInfoSchema,
    players: z.array(PublicPlayerSummarySchema),
    cycle: z.number(),
    roundInCycle: z.number(),
    adminId: z.string().nullable(),
    firewallActive: z.boolean(),
    matchClock: MatchClockSchema,
    currentMinigame: z.object({ minigameId: z.string(), tvView: z.unknown() }).nullable(),
    currentSpecialGame: z.object({ participantIds: z.array(z.string()), tvView: z.unknown() }).nullable(),
    hackerCount: z.number(),
    accusation: AccusationPublicViewSchema.nullable(),
    accusationCooldownUntil: z.number().nullable(),
    lastRoundResult: LastRoundResultSchema,
    winner: WinnerSchema,
    finalReveal: FinalRoleRevealSchema,
  })
  .passthrough();

export const PlayerViewPayloadSchema = z
  .object({
    playerId: z.string(),
    self: PublicPlayerSummarySchema,
    others: z.array(PublicPlayerSummarySchema),
    phase: PhaseInfoSchema,
    adminId: z.string().nullable(),
    isParticipantThisRound: z.boolean(),
    isAdmin: z.boolean(),
    adminSelection: AdminSelectionInfoSchema.nullable(),
    hackerInfo: HackerPlayerInfoSchema.nullable(),
    matchClock: MatchClockSchema,
    minigameView: z.unknown(),
    canAct: z.boolean(),
    hackerCount: z.number(),
    canPushButton: z.boolean(),
    accusation: PlayerAccusationInfoSchema.nullable(),
    accusationCooldownUntil: z.number().nullable(),
    lastRoundResult: LastRoundResultSchema,
    winner: WinnerSchema,
    finalReveal: FinalRoleRevealSchema,
  })
  .passthrough();

export const PrivatePlayerPayloadSchema = z
  .object({
    playerId: z.string(),
    role: z.enum(['CREW', 'HACKER']),
    fellowHackerIds: z.array(z.string()),
  })
  .passthrough();
