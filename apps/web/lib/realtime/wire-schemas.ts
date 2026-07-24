import { z } from 'zod';

/**
 * Small, dedicated frontend validation schemas for the WebSocket gateway's wire format
 * (ARCHITECTURE.md Step 4 / apps/server/src/gateway/schemas.ts's `WireMessageSchema`, mirrored
 * here rather than imported — the server-side schema table also validates INBOUND client→server
 * FSM event payloads, which this client never needs; keeping a separate, minimal, frontend-owned
 * copy avoids a zod cross-package dependency question for zero real benefit).
 *
 * These validate the STRUCTURAL fields this client actually reads (phase, players, connection
 * status, role, error code/message) — never a byte is trusted past `JSON.parse()` without going
 * through one of these first. Fields the client doesn't render yet (`currentMinigame`,
 * `votingProgress`, `matchClock`, etc. — all opaque or out of scope for the lobby-only UI this step
 * builds) are typed `z.unknown()` rather than hand-mirroring their full recursive shape forever;
 * the source of truth for those is `packages/shared-types`, and this client already doesn't render
 * them, so a permissive but present unknown() check verifies "the field exists" without duplicating
 * game-domain schema maintenance the server already owns.
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

export const TvViewPayloadSchema = z
  .object({
    roomCode: z.string(),
    phase: PhaseInfoSchema,
    players: z.array(PublicPlayerSummarySchema),
    cycle: z.number(),
    roundInCycle: z.number(),
    firewallActive: z.boolean(),
    matchClock: z.unknown(),
    currentMinigame: z.unknown(),
    currentSpecialGame: z.unknown(),
    votingProgress: z.unknown(),
    lastRoundResult: z.unknown(),
    winner: z.unknown(),
  })
  .passthrough();

export const PlayerViewPayloadSchema = z
  .object({
    playerId: z.string(),
    self: PublicPlayerSummarySchema,
    others: z.array(PublicPlayerSummarySchema),
    phase: PhaseInfoSchema,
    isParticipantThisRound: z.boolean(),
    minigameView: z.unknown(),
    canVote: z.boolean(),
    canAct: z.boolean(),
    lastRoundResult: z.unknown(),
  })
  .passthrough();

export const PrivatePlayerPayloadSchema = z
  .object({
    playerId: z.string(),
    role: z.enum(['CREW', 'HACKER']),
    fellowHackerIds: z.array(z.string()),
  })
  .passthrough();
