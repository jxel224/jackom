import type { AccusationPublicView, TvView } from '../shared.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';
import { getAllPlayers } from '../selectors/players.js';
import { getMinigameModule, getSpecialGameModule } from '../minigames/registry.js';
import { lastRoundResultFor, toPublicSummary, buildFinalReveal } from './view-utils.js';

/** GAMEPLAY_RULES_V1.md accusation §33 — public accusation state, never individual votes or roles. */
function buildAccusationPublicView(room: RoomState): AccusationPublicView {
  const acc = room.currentAccusation!;
  return {
    initiatorId: acc.initiatorId,
    requiredSuspectCount: acc.requiredSuspectCount,
    suspectIds: acc.suspectIds,
    votedCount: acc.suspectIds !== null ? Object.keys(acc.votes).length : null,
    totalEligible: acc.suspectIds !== null ? acc.eligibleVoterIds.length : null,
  };
}

/**
 * Builds the ONLY payload ever sent to the host/TV socket. `priv` is optional and, when supplied,
 * is used for exactly one thing: `finalReveal`, gated on `room.winner !== null` — the one moment
 * TV is allowed to see roles at all (GAMEPLAY_RULES_V1.md's secrecy guarantees remain in force for
 * every other field regardless of whether a caller happens to pass `priv`).
 */
export function buildTvView(room: RoomState, priv?: RoomPrivateState): TvView {
  const minigameViewContext = { revealResults: room.phase.state === 'RESULTS_REVEAL' };
  // `currentRound` exists the moment the Admin's selection is accepted (HACKER_CORRUPTION), but
  // `moduleState` stays null until the hack window resolves and `module.start()` actually runs
  // (proceedToInstructions, at MINIGAME_INSTRUCTIONS entry) — see GAMEPLAY_RULES_V1.md §7. Calling
  // a module's buildTvView with a null state before that point crashed every module (found by
  // Core Logic Phase 1.1's hack-secrecy tests, which are the first tests to ever build a view
  // during the hack window). There is genuinely nothing minigame-specific to show yet at that
  // point, so `null` here is the correct representation, not a workaround.
  const currentMinigame = room.currentRound && room.currentRound.moduleState !== null
    ? {
        minigameId: room.currentRound.minigameId,
        tvView: getMinigameModule(room.currentRound.minigameId).buildTvView(room.currentRound.moduleState, minigameViewContext),
      }
    : null;

  const currentSpecialGame = room.currentSpecialRound && room.currentSpecialRound.moduleState !== null
    ? {
        participantIds: room.currentSpecialRound.participantIds,
        tvView: getSpecialGameModule().buildTvView(room.currentSpecialRound.moduleState, {
          revealResults: room.phase.state === 'SPECIAL_GAME_RESULT',
        }),
      }
    : null;

  const accusation = room.phase.state === 'ACCUSATION_SELECT' || room.phase.state === 'ACCUSATION_VOTE' ? buildAccusationPublicView(room) : null;

  return {
    roomCode: room.roomCode,
    phase: room.phase,
    players: getAllPlayers(room).map(toPublicSummary),
    cycle: room.cycle,
    roundInCycle: room.roundInCycle,
    adminId: room.adminId,
    firewallActive: room.firewallActive,
    matchClock: room.matchClock,
    currentMinigame,
    currentSpecialGame,
    hackerCount: room.hackerCount,
    accusation,
    accusationCooldownUntil: room.accusationCooldownUntil,
    lastRoundResult: lastRoundResultFor(room),
    winner: room.winner,
    finalReveal: buildFinalReveal(room, priv),
  };
}
