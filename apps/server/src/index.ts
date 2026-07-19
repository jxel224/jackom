// Barrel export of the server package's public surface (Steps 1-3 — no WebSocket gateway, UI, or Postgres yet).

export * from './shared.js';

export type { Deps } from './types/deps.js';
export type { HostSession, PlayerPrivate } from './types/sessions.js';
export type { RoomState, RoomPrivateState } from './types/room-state.js';

export { createDefaultDeps } from './fsm/default-deps.js';
export { createDefaultConfig } from './config/defaults.js';

export {
  getAllPlayers,
  getPlayerCount,
  getAlivePlayers,
  getConnectedPlayers,
  getEligibleMinigamePlayers,
  getEligibleSpecialGamePool,
  getEligibleVoters,
} from './selectors/players.js';

export { createRoom, joinPlayer, leavePlayer, setPlayerProfile, kickPlayer } from './fsm/room-lifecycle.js';
export type { CreateRoomResult, JoinPlayerResult, RoomAndPriv } from './fsm/room-lifecycle.js';
export { handleEvent } from './fsm/transitions.js';
export type { HandleEventResult, Rejection } from './fsm/result.js';
export { checkWinCondition } from './fsm/win-condition.js';

export { minigameRegistry, getMinigameModule, getSpecialGameModule } from './minigames/registry.js';
export { GenericMinigameModule } from './minigames/generic-minigame.js';
export { GenericSpecialGameModule } from './minigames/generic-special-game.js';

export {
  roleBalanceRegistry,
  specialGameScheduleRegistry,
  specialGameParticipantRegistry,
  minigameSelectionRegistry,
  corruptionAggregationRegistry,
} from './rules/registries.js';

export { tally } from './voting/tally.js';
export type { TallyResult } from './voting/tally.js';

export { buildTvView } from './views/build-tv-view.js';
export { buildPlayerView } from './views/build-player-view.js';
export { buildPrivatePlayerView } from './views/build-private-player-view.js';

// ---- Step 3: persistence + room actor ----------------------------------------------------------

export type { KeyValueStore } from './persistence/kv-store.js';
export { InMemoryKeyValueStore } from './persistence/in-memory-kv-store.js';
export { RedisKeyValueStore } from './persistence/redis-kv-store.js';
export { RepositoryError, RoomConsistencyError } from './persistence/errors.js';
export type { RepositoryErrorCode, RoomConsistencyErrorCode } from './persistence/errors.js';
export { DEFAULT_ROOM_TTL_SECONDS } from './persistence/config.js';
export * as persistenceKeys from './persistence/keys.js';
export { noopRoomLogger, consoleRoomLogger } from './persistence/logging.js';
export type { RoomLogger, RoomLogEvent } from './persistence/logging.js';

export { KeyValueRoomStateRepository } from './persistence/room-state-repo.js';
export type { RoomStateRepository } from './persistence/room-state-repo.js';
export { KeyValueRoomPrivateStateRepository } from './persistence/room-private-state-repo.js';
export type { RoomPrivateStateRepository } from './persistence/room-private-state-repo.js';
export { KeyValueRoomLookupRepository } from './persistence/room-lookup-repo.js';
export type { RoomLookupRepository } from './persistence/room-lookup-repo.js';
export { KeyValueSessionRepository } from './persistence/session-repo.js';
export type { SessionRepository, PlayerSessionRecord, HostSessionRecord } from './persistence/session-repo.js';

export { RoomActor } from './actors/room-actor.js';
export type { RoomActorDeps, LifecycleOutcome } from './actors/room-actor.js';
export { RoomActorManager } from './actors/room-actor-manager.js';
export type { RoomActorManagerDeps, CreatedRoomHandle } from './actors/room-actor-manager.js';

// ---- Step 4: WebSocket gateway ------------------------------------------------------------------

export { GatewayServer } from './gateway/gateway-server.js';
export type { GatewayDeps, GatewayOptions } from './gateway/gateway-server.js';
export type { WireMessage, GatewayErrorCode, GatewayErrorPayload, ConnectionKind } from './gateway/types.js';
export { RoomSocketRegistry } from './gateway/connection-registry.js';
export { RateLimiter } from './gateway/rate-limiter.js';
export {
  WireMessageSchema,
  FSM_EVENT_PAYLOAD_SCHEMAS,
  PlayerJoinPayloadSchema,
  PlayerReconnectPayloadSchema,
  HostReconnectPayloadSchema,
  PlayerLeavePayloadSchema,
  SYSTEM_ONLY_EVENT_TYPES,
  GATEWAY_LIFECYCLE_EVENT_TYPES,
} from './gateway/schemas.js';
