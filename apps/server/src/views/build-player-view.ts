import type { PlayerView } from '../shared.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';
import { getAllPlayers, getEligibleVoters } from '../selectors/players.js';
import { getMinigameModule, getSpecialGameModule } from '../minigames/registry.js';
import { lastRoundResultFor, toPublicSummary } from './view-utils.js';

/**
 * Builds the payload sent to a single player's own socket. Accepts RoomPrivateState only to look
 * up that player's OWN role (needed by MiniGameModule.buildPlayerView's `role` parameter) — the
 * returned PlayerView has no field capable of holding a role, so nothing private leaks through the
 * return value even though private state was consulted internally.
 */
export function buildPlayerView(room: RoomState, priv: RoomPrivateState, playerId: string): PlayerView {
  const self = room.players[playerId];
  if (!self) {
    throw new Error(`buildPlayerView: unknown playerId ${playerId}`);
  }
  const role = priv.players[playerId]?.role ?? 'CREW';

  const isParticipant =
    room.currentRound?.participantIds.includes(playerId) ??
    room.currentSpecialRound?.participantIds.includes(playerId) ??
    false;

  let minigameView = null;
  if (room.currentRound) {
    const module = getMinigameModule(room.currentRound.minigameId);
    minigameView = room.currentRound.participantIds.includes(playerId)
      ? module.buildPlayerView(room.currentRound.moduleState, playerId, role)
      : module.buildSpectatorView(room.currentRound.moduleState);
  } else if (room.currentSpecialRound) {
    const module = getSpecialGameModule();
    minigameView = room.currentSpecialRound.participantIds.includes(playerId)
      ? module.buildPlayerView(room.currentSpecialRound.moduleState, playerId, role)
      : module.buildSpectatorView(room.currentSpecialRound.moduleState);
  }

  const canVote = getEligibleVoters(room).some((p) => p.playerId === playerId);

  return {
    playerId,
    self: toPublicSummary(self),
    others: getAllPlayers(room)
      .filter((p) => p.playerId !== playerId)
      .map(toPublicSummary),
    phase: room.phase,
    isParticipantThisRound: isParticipant,
    minigameView,
    canVote,
    canAct: isParticipant,
    lastRoundResult: lastRoundResultFor(room),
  };
}
