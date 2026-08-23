import type { ConnectionStatus, Role } from '../shared.js';

/**
 * Host and player are distinct session types with independent tokens — the host device is never
 * a player row (ARCHITECTURE.md §1.1). Both are server-internal: never serialized to a client.
 */
export interface HostSession {
  /** Bound to roomId ONLY, never to a playerId. */
  hostSessionToken: string;
  connectionStatus: ConnectionStatus;
  connectedAt: number;
  lastSeenAt: number;
  /**
   * Durable reference to the permanent User (PostgreSQL) who owns/created this room — Permanent
   * Business Backend phase. `null` only for rooms created before this field existed (pre-migration
   * data) or in tests that construct a RoomState directly; every room created through the real
   * `POST /api/rooms` route always has one, since that route now requires authentication+ownership
   * before creating any room at all. Server-only, same as the rest of `HostSession` — never
   * serialized into `TvView`/`PlayerView`, and never used to re-derive the User's email or any
   * other account detail during gameplay (RoomActor never touches Postgres — see
   * PERMANENT_BACKEND_FOUNDATION_REPORT.md's "Do not couple RoomActor to Prisma" boundary).
   */
  hostUserId: string | null;
}

/** Server-only. Never serialized into any client-facing payload. */
export interface PlayerPrivate {
  playerId: string;
  /** Bound to { roomId, playerId }. */
  sessionToken: string;
  role: Role | null;
  lastSeenAt: number;
}
