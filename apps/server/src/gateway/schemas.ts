import { z } from 'zod';
import { JsonValueSchema } from '../persistence/schemas.js';

/**
 * Wire-level validation. Every incoming message is checked against `WireMessageSchema` first
 * (envelope shape), then — for events that reach the FSM — against the specific schema for its
 * `type` in `FSM_EVENT_PAYLOAD_SCHEMAS`. Nothing here ever includes a `playerId` field: identity
 * always comes from the authenticated socket (ARCHITECTURE.md §1.1), never from the payload, so
 * there is structurally nothing for a client to spoof even if it tries.
 */

export const WireMessageSchema = z.object({
  type: z.string().min(1).max(64),
  requestId: z
    .union([z.string().min(1).max(128), z.null()])
    .optional()
    .transform((v) => v ?? null),
  payload: z.unknown(),
});

const phaseIdOnly = z.object({ phaseId: z.string().min(1) });
const empty = z.object({});

/**
 * One schema per FSM event `type` a client may legally send. `host:graceExpired`,
 * `timer:expired`, and `player:disconnected` are deliberately ABSENT — those are system-only
 * events (ARCHITECTURE.md shared-types/events.ts) and are rejected before ever reaching this table.
 */
export const FSM_EVENT_PAYLOAD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'host:startGame': phaseIdOnly,
  'host:skipIntro': phaseIdOnly,
  'host:skipInstructions': phaseIdOnly,
  'host:skipRevealTimer': phaseIdOnly,
  'host:skipResultsReveal': phaseIdOnly,
  'host:skipSpecialIntro': phaseIdOnly,
  'host:forceEndMinigame': phaseIdOnly,
  'host:forceEndSpecialGame': phaseIdOnly,
  'host:endDiscussionEarly': phaseIdOnly,
  'host:endVoteEarly': phaseIdOnly,
  'host:advance': phaseIdOnly,
  'host:restartMatch': empty,
  'host:closeRoom': empty,
  'player:acknowledgeReveal': phaseIdOnly,
  'player:requestRematch': phaseIdOnly,
  'player:submitCorruptionChoice': z.object({ phaseId: z.string().min(1), corrupt: z.boolean() }),
  'player:submitVote': z.object({ phaseId: z.string().min(1), targetPlayerId: z.string().min(1).max(64) }),
  'player:submitAction': z.object({
    phaseId: z.string().min(1),
    seq: z.number().int().nonnegative(),
    actionId: z.string().min(1).max(128),
    actionType: z.string().min(1).max(64),
    data: JsonValueSchema,
  }),
};

/** Event types that exist on the wire but never reach the FSM — handled entirely by the gateway. */
export const PlayerJoinPayloadSchema = z.object({
  name: z.string().min(1).max(40),
  avatarId: z.string().min(1).max(40),
});
export const PlayerReconnectPayloadSchema = z.object({ sessionToken: z.string().min(1).max(200) });
export const HostReconnectPayloadSchema = z.object({ hostSessionToken: z.string().min(1).max(200) });
export const PlayerLeavePayloadSchema = z.object({});

/**
 * Events a real client must never send — they're synthesized internally only, by the gateway's own
 * connection tracker (on socket open/close) or, eventually, a server-side timer scheduler.
 */
export const SYSTEM_ONLY_EVENT_TYPES = new Set([
  'timer:expired',
  'player:disconnected',
  'player:reconnected',
  'host:graceExpired',
  'host:disconnected',
  'host:reconnected',
]);

/** Gateway-handled auth/lifecycle message types (not FSM events). */
export const GATEWAY_LIFECYCLE_EVENT_TYPES = new Set(['player:join', 'player:reconnect', 'host:reconnect', 'player:leave']);
