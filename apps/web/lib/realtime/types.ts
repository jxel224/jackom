import type { DisplayError, TvView, PlayerView, PrivatePlayerPayload } from './public-types';

/**
 * Typed frontend boundaries for the WebSocket client (Development Steps 6 → 7B). UI components are
 * written against these interfaces so the underlying transport (`RealtimeSocket`) can change without
 * touching component code.
 *
 * Only view PROJECTIONS are consumed — `RoomState`/`RoomPrivateState` are not exported by
 * `@jackom/shared-types` at all (ARCHITECTURE.md §8.6), so there is structurally nothing raw for a
 * component to import even by mistake.
 */

/**
 * The web client's own socket lifecycle. Deliberately distinct from `ConnectionStatus`
 * (`@jackom/shared-types`), which describes a PLAYER's connection status as the server sees it
 * (`PlayerPublic.connectionStatus`) — this type is "is my own browser tab talking to the server."
 *
 * - `idle` — not connecting yet (no session available, or not mounted).
 * - `connecting` — TCP/WS handshake in progress (first attempt).
 * - `authenticating` — socket open, auth message sent, awaiting the server's ack.
 * - `connected` — authenticated and receiving views.
 * - `reconnecting` — a previously-connected (or previously-attempted) socket dropped and a retry is scheduled/in flight.
 * - `disconnected` — not connected and not currently retrying (e.g. offline, or replaced by another socket) — recoverable.
 * - `unauthorized` — the server explicitly rejected the session (invalid/expired/room-mismatch) — auto-reconnect stops; the user must obtain a new session.
 * - `failed` — repeated automatic attempts were exhausted, or the room itself is gone — recoverable only via manual retry.
 */
export type ConnectionState = 'idle' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting' | 'disconnected' | 'unauthorized' | 'failed';

/** What the TV/host screen needs to render. */
export interface TvScreenState {
  connection: ConnectionState;
  view: TvView | null;
  error: DisplayError | null;
}

/**
 * What a player's phone screen needs to render. `privateInfo` is the one payload here that must
 * never be logged, cached insecurely, or rendered anywhere but the owning player's own screen
 * (ARCHITECTURE.md §8.6 — role + fellow-hacker ids).
 */
export interface PlayerScreenState {
  connection: ConnectionState;
  view: PlayerView | null;
  privateInfo: PrivatePlayerPayload | null;
  error: DisplayError | null;
}
