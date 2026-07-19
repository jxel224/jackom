// Barrel export of the server package's public surface (Step 1 + Step 2 only — no networking/persistence yet).

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
