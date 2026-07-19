import type { TvView } from '../shared.js';
import type { RoomState } from '../types/room-state.js';
import { getAllPlayers, getEligibleVoters } from '../selectors/players.js';
import { getMinigameModule, getSpecialGameModule } from '../minigames/registry.js';
import { lastRoundResultFor, toPublicSummary } from './view-utils.js';

/**
 * Builds the ONLY payload ever sent to the host/TV socket. Never accepts RoomPrivateState as
 * input — there is nothing private this function could reach even by mistake.
 */
export function buildTvView(room: RoomState): TvView {
  const currentMinigame = room.currentRound
    ? {
        minigameId: room.currentRound.minigameId,
        tvView: getMinigameModule(room.currentRound.minigameId).buildTvView(room.currentRound.moduleState),
      }
    : null;

  const currentSpecialGame = room.currentSpecialRound
    ? {
        participantIds: room.currentSpecialRound.participantIds,
        tvView: getSpecialGameModule().buildTvView(room.currentSpecialRound.moduleState),
      }
    : null;

  const votingProgress = room.currentVote
    ? { votedCount: Object.keys(room.currentVote.votes).length, totalEligible: getEligibleVoters(room).length }
    : null;

  return {
    roomCode: room.roomCode,
    phase: room.phase,
    players: getAllPlayers(room).map(toPublicSummary),
    cycle: room.cycle,
    roundInCycle: room.roundInCycle,
    firewallActive: room.firewallActive,
    matchClock: room.matchClock,
    currentMinigame,
    currentSpecialGame,
    votingProgress,
    lastRoundResult: lastRoundResultFor(room),
    winner: room.winner,
  };
}
