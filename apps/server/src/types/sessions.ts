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
}

/** Server-only. Never serialized into any client-facing payload. */
export interface PlayerPrivate {
  playerId: string;
  /** Bound to { roomId, playerId }. */
  sessionToken: string;
  role: Role | null;
  lastSeenAt: number;
}
