import type { DisplayError, TvView, PlayerView, PrivatePlayerPayload } from './public-types';

/**
 * Typed frontend boundaries for the future WebSocket client (Development Step 6 scope: types and
 * shapes only — no client, no socket, no reconnection logic implemented here yet). UI components
 * should be written against these interfaces so wiring in a real client later never requires
 * touching component code, only whatever produces `TvScreenState`/`PlayerScreenState`.
 *
 * Only view PROJECTIONS are consumed — `RoomState`/`RoomPrivateState` are not exported by
 * `@jackom/shared-types` at all (ARCHITECTURE.md §8.6), so there is structurally nothing raw for a
 * component to import even by mistake.
 */

/**
 * The web client's own socket lifecycle. Deliberately distinct from `ConnectionStatus`
 * (`@jackom/shared-types`), which describes a PLAYER's connection status as the server sees it
 * (`PlayerPublic.connectionStatus`) — this type is "is my own browser tab talking to the server."
 */
export type SocketConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** What the TV/host screen needs to render, once a real client populates it. */
export interface TvScreenState {
  connection: SocketConnectionState;
  view: TvView | null;
  error: DisplayError | null;
}

/**
 * What a player's phone screen needs to render. `privateInfo` is the one payload here that must
 * never be logged, cached insecurely, or rendered anywhere but the owning player's own screen
 * (ARCHITECTURE.md §8.6 — role + fellow-hacker ids).
 */
export interface PlayerScreenState {
  connection: SocketConnectionState;
  view: PlayerView | null;
  privateInfo: PrivatePlayerPayload | null;
  error: DisplayError | null;
}
