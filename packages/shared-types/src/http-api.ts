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
  | 'INTERNAL_ERROR'
  // Permanent Business Backend (Users/Auth/Ownership) — see PERMANENT_BACKEND_FOUNDATION_REPORT.md.
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD'
  | 'INVALID_DISPLAY_NAME_LENGTH'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'GAME_NOT_FOUND'
  | 'GAME_NOT_ACTIVE'
  | 'GAME_NOT_OWNED';

/** The ONLY shape an error response body ever takes — never a stack trace, Redis error, or raw exception message. */
export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
}

/**
 * POST /api/rooms request. `gameSlug` is required (Permanent Business Backend) — the server
 * verifies the caller is authenticated (a valid auth session cookie) AND owns an active Game with
 * this slug before creating any Redis room state; see `db/services/ownership-service.ts`. Guest
 * players joining an existing room (`POST /api/rooms/:code/players`) are completely unaffected —
 * this requirement applies only to room CREATION, i.e. hosting.
 */
export interface CreateRoomRequestBody {
  gameSlug: string;
}

/** POST /api/rooms response. `tv` is a normal `TvView` projection (never raw `RoomState`) — safe to render immediately on `/tv`. */
export interface CreateRoomResponseBody {
  roomCode: string;
  hostSessionToken: string;
  tv: TvView;
}

/**
 * GET /api/rooms/:roomCode response — minimal public availability info, no roster/private content.
 * `minPlayers` (Step 7B) lets the TV lobby show an accurate "needs N more players" disabled state
 * for the start button — a UX affordance only; the server remains the sole authority (`host:startGame`
 * is still validated by the FSM regardless of what the frontend chooses to disable).
 */
export interface RoomAvailabilityResponseBody {
  roomCode: string;
  joinable: boolean;
  full: boolean;
  matchStarted: boolean;
  playerCount: number;
  minPlayers: number;
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

// ---- Permanent Business Backend: Users / Authentication / Ownership ---------------------------
// A User is a permanent host/purchaser account — completely distinct from a Player (a temporary,
// account-free realtime match participant; see JoinRoomRequestBody/JoinRoomResponseBody above,
// which remain entirely untouched by any of this). See PERMANENT_BACKEND_FOUNDATION_REPORT.md.

/** Everything about a User that is ever safe to send to any client — never `passwordHash`. */
export interface SafeUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface RegisterRequestBody {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequestBody {
  email: string;
  password: string;
}

/** POST /api/auth/register and POST /api/auth/login both respond with this — the session itself travels only as an HttpOnly cookie, never in this body. */
export interface AuthResponseBody {
  user: SafeUser;
}

/** GET /api/auth/me response when authenticated (401 UNAUTHENTICATED otherwise — there is no 200-with-null shape). */
export interface MeResponseBody {
  user: SafeUser;
}

export interface OwnedGameSummary {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

/** GET /api/games/owned response — only the games the authenticated caller actually owns, never any other User's ownership records. */
export interface OwnedGamesResponseBody {
  games: OwnedGameSummary[];
}
