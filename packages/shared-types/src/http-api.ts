import type { TvView, PlayerView } from './views';

/**
 * Wire contracts for Development Step 7A's HTTP room-create/join API. These are genuinely shared
 * between the server (`apps/server/src/http/`) and the web client (`apps/web/lib/api/`) — the same
 * relationship `WireMessage`/`InboundEvent` already have for the WebSocket boundary — so they live
 * here rather than being hand-duplicated on both sides. The actual `HttpApiServer` implementation,
 * zod request-validation schemas, and Express-style routing stay server-only; only the plain data
 * shapes are shared.
 */

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_ROOM_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_FULL'
  | 'ROOM_NOT_JOINABLE'
  | 'INVALID_DISPLAY_NAME'
  | 'DUPLICATE_PLAYER'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** The ONLY shape an error response body ever takes — never a stack trace, Redis error, or raw exception message. */
export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
}

/** POST /api/rooms response. `tv` is a normal `TvView` projection (never raw `RoomState`) — safe to render immediately on `/tv`. */
export interface CreateRoomResponseBody {
  roomCode: string;
  hostSessionToken: string;
  tv: TvView;
}

/** GET /api/rooms/:roomCode response — minimal public availability info, no roster/private content. */
export interface RoomAvailabilityResponseBody {
  roomCode: string;
  joinable: boolean;
  full: boolean;
  matchStarted: boolean;
  playerCount: number;
  maxPlayers: number;
}

export interface JoinRoomRequestBody {
  displayName: string;
  /** Optional client-generated idempotency key — a retried request with the same key on the same room replays the original result instead of registering a second player. */
  requestId?: string;
}

/** POST /api/rooms/:roomCode/players response. `view` is a normal `PlayerView` projection (never raw `RoomState`/`RoomPrivateState`). */
export interface JoinRoomResponseBody {
  roomCode: string;
  playerId: string;
  playerSessionToken: string;
  view: PlayerView;
}
