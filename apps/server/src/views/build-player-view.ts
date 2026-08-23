import type { AdminSelectionInfo, HackerPlayerInfo, PlayerAccusationInfo, PlayerView } from '../shared.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';
import { getAllPlayers, getEligibleVoters } from '../selectors/players.js';
import { getMinigameModule, getSpecialGameModule, minigameRegistry } from '../minigames/registry.js';
import { MINIGAME_PARTICIPANT_LIMITS } from '../rules/participant-limits.js';
import { ACCUSATION_ALLOWED_STATES } from '../rules/accusation.js';
import { lastRoundResultFor, toPublicSummary, buildFinalReveal } from './view-utils.js';

/** GAMEPLAY_RULES_V1.md §11 — only ever computed for the current Admin, only during MINIGAME_SELECT. */
function buildAdminSelectionInfo(room: RoomState): AdminSelectionInfo {
  return {
    availableMinigameIds: Object.keys(minigameRegistry),
    participantLimits: MINIGAME_PARTICIPANT_LIMITS,
    eligiblePlayerIds: getAllPlayers(room)
      .filter((p) => room.config.eliminatedPlayerPolicy.canPlayMinigames || p.alive)
      .map((p) => p.playerId),
  };
}

/** GAMEPLAY_RULES_V1.md §11 — only ever computed for the requesting player's own Hacker role, never for Crew. */
function buildHackerInfo(room: RoomState, priv: RoomPrivateState, playerId: string): HackerPlayerInfo {
  const hacksRemaining = priv.hacksRemaining[playerId] ?? 0;
  const inHackWindow = room.phase.state === 'HACKER_CORRUPTION' && room.currentRound !== null;
  const alreadyActed = room.currentRound?.hackerActionsUsed[playerId] === true;
  const canHackNow = inHackWindow && !room.firewallActive && hacksRemaining > 0 && !alreadyActed;
  return {
    hacksRemaining,
    canHackNow,
    eligibleTargetIds: canHackNow ? (room.currentRound?.participantIds ?? []) : [],
  };
}

/** GAMEPLAY_RULES_V1.md accusation §34 — only computed while an accusation is active; never reveals another player's vote or role. */
function buildPlayerAccusationInfo(room: RoomState, playerId: string): PlayerAccusationInfo {
  const acc = room.currentAccusation!;
  const isInitiator = acc.initiatorId === playerId;
  return {
    initiatorId: acc.initiatorId,
    isInitiator,
    requiredSuspectCount: acc.requiredSuspectCount,
    suspectIds: acc.suspectIds,
    eligibleSuspectIds: isInitiator && acc.suspectIds === null ? getEligibleVoters(room).map((p) => p.playerId) : null,
    hasVoted: acc.suspectIds !== null ? playerId in acc.votes : false,
    votedCount: acc.suspectIds !== null ? Object.keys(acc.votes).length : null,
    totalEligible: acc.suspectIds !== null ? acc.eligibleVoterIds.length : null,
  };
}

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

  // Both `currentRound.moduleState` and `currentSpecialRound.moduleState` stay null until
  // `module.start()` actually runs (the hack window / SPECIAL_GAME_INTRO haven't resolved yet —
  // see the matching comment in build-tv-view.ts). Calling a module function with a null state
  // crashes every module; `null` is the correct, honest view for "nothing to show yet."
  let minigameView = null;
  if (room.currentRound && room.currentRound.moduleState !== null) {
    const module = getMinigameModule(room.currentRound.minigameId);
    const viewContext = { revealResults: room.phase.state === 'RESULTS_REVEAL' };
    minigameView = room.currentRound.participantIds.includes(playerId)
      ? module.buildPlayerView(room.currentRound.moduleState, playerId, role, viewContext)
      : module.buildSpectatorView(room.currentRound.moduleState, viewContext);
  } else if (room.currentSpecialRound && room.currentSpecialRound.moduleState !== null) {
    const module = getSpecialGameModule();
    minigameView = room.currentSpecialRound.participantIds.includes(playerId)
      ? module.buildPlayerView(room.currentSpecialRound.moduleState, playerId, role, {
          revealResults: room.phase.state === 'SPECIAL_GAME_RESULT',
        })
      : module.buildSpectatorView(room.currentSpecialRound.moduleState, {
          revealResults: room.phase.state === 'SPECIAL_GAME_RESULT',
        });
  }

  // Eligibility only, not a client-facing field of its own — feeds `canPushButton` below (the
  // legacy per-cycle elimination vote this used to also gate a `canVote` PlayerView field for was retired).
  const canVote = getEligibleVoters(room).some((p) => p.playerId === playerId);
  const isAdmin = room.adminId === playerId;
  const accusationActive = room.phase.state === 'ACCUSATION_SELECT' || room.phase.state === 'ACCUSATION_VOTE';
  // Advisory only — the server re-validates every rule authoritatively in handlePushButton()
  // regardless of what this flag says (including the live cooldown check, which needs `now()` and
  // so can't be baked in here; see `accusationCooldownUntil` below, exposed the same way
  // `matchClock.deadlineAt` is — a raw timestamp for the client to compare against).
  const canPushButton = ACCUSATION_ALLOWED_STATES.has(room.phase.state) && room.currentAccusation === null && canVote;

  return {
    playerId,
    self: toPublicSummary(self),
    others: getAllPlayers(room)
      .filter((p) => p.playerId !== playerId)
      .map(toPublicSummary),
    phase: room.phase,
    adminId: room.adminId,
    isParticipantThisRound: isParticipant,
    isAdmin,
    adminSelection: isAdmin && room.phase.state === 'MINIGAME_SELECT' ? buildAdminSelectionInfo(room) : null,
    hackerInfo: role === 'HACKER' ? buildHackerInfo(room, priv, playerId) : null,
    matchClock: room.matchClock,
    minigameView,
    canAct: isParticipant,
    hackerCount: room.hackerCount,
    canPushButton,
    accusation: accusationActive ? buildPlayerAccusationInfo(room, playerId) : null,
    accusationCooldownUntil: room.accusationCooldownUntil,
    lastRoundResult: lastRoundResultFor(room),
    winner: room.winner,
    finalReveal: buildFinalReveal(room, priv),
  };
}
