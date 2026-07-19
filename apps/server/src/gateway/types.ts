import type { RejectionCode } from '../shared.js';

/**
 * Wire envelope — identical shape both directions (ARCHITECTURE.md Step 4 message format).
 * `payload` is intentionally `unknown` on the way in (validated per-`type` by gateway/schemas.ts
 * before anything touches the FSM) and whatever JSON-serializable value the gateway is sending on
 * the way out (TvView/PlayerView/PrivatePlayerPayload/ack objects/error payloads).
 */
export interface WireMessage {
  type: string;
  requestId: string | null;
  payload: unknown;
}

/**
 * Every code the gateway can return to a client. `RejectionCode` (from the FSM, shared-types) is
 * included verbatim — a rejected `handleEvent()` result is forwarded to the client as-is, not
 * translated into a different vocabulary. Everything else here is gateway-specific: it never
 * reaches the FSM at all (the message was rejected before dispatch).
 */
export type GatewayErrorCode =
  | RejectionCode
  | 'MALFORMED_JSON'
  | 'INVALID_MESSAGE_SCHEMA'
  | 'NOT_AUTHENTICATED'
  | 'ALREADY_AUTHENTICATED'
  | 'UNKNOWN_ROOM'
  | 'SESSION_INVALID'
  | 'SESSION_ROOM_MISMATCH'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_EVENT_TYPE'
  | 'WRONG_CONNECTION_KIND'
  | 'SYSTEM_EVENT_NOT_ALLOWED'
  | 'ROOM_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface GatewayErrorPayload {
  code: GatewayErrorCode;
  message: string;
}

export type ConnectionKind = 'host' | 'player';
