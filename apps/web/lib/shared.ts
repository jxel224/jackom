/**
 * Single point of contact with the shared-types package, mirroring apps/server/src/shared.ts.
 * Every other file under apps/web imports shared types via a relative path to THIS file, so the
 * awkward `packages/shared-types/src` relative path only has to be written once.
 *
 * `packages/shared-types` deliberately never exports `RoomState`/`RoomPrivateState` (those stay
 * server-only, in apps/server/src/types/) — everything this barrel re-exports is already safe for
 * the browser: view projections (`TvView`, `PlayerView`, `PrivatePlayerPayload`), wire event/config
 * shapes, and small format helpers like the room-code alphabet.
 */
export * from '../../../packages/shared-types/src/index';
