import type { EventSender, GameState, InboundEvent, MiniGameContext } from '../shared.js';
import type { Deps } from '../types/deps.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';
import {
  getAllPlayers,
  getConnectedPlayers,
  getEligibleMinigamePlayers,
  getEligibleSpecialGamePool,
  getEligibleVoters,
  getPlayerCount,
} from '../selectors/players.js';
import { checkSenderMatchesEvent, getHackerIds, hasSubmittedThisPhase, isEligibleVoter, isHacker, isStalePhase, recordSubmission } from './guards.js';
import { ok, rejected, type HandleEventResult } from './result.js';
import { durationFor } from './durations.js';
import { initMatchClock } from './match-clock.js';
import { checkWinCondition } from './win-condition.js';
import { randomSubset } from './random.js';
import { getMinigameModule, getSpecialGameModule, minigameRegistry } from '../minigames/registry.js';
import {
  corruptionAggregationRegistry,
  minigameSelectionRegistry,
  roleBalanceRegistry,
  specialGameParticipantRegistry,
  specialGameScheduleRegistry,
} from '../rules/registries.js';
import { tally } from '../voting/tally.js';

/**
 * The full state-transition core (ARCHITECTURE.md §9, updated per §13 audit). Pure with respect to
 * its inputs: `handleEvent` clones `room`/`priv` via structuredClone before mutating, so callers'
 * references are never mutated in place.
 *
 * Two states are modeled as instantaneous "pass-through" phases that never wait for an external
 * event — ROLE_ASSIGNMENT and MINIGAME_SELECT (and HACKER_CORRUPTION, conditionally, when the
 * Firewall is active). `transition()` always calls `autoAdvance()` immediately after moving into a
 * new phase, and `autoAdvance()` performs that phase's synchronous work and recurses into the next
 * `transition()` call itself. This resolves an ambiguity in the original pseudocode, where these
 * states had no external event that could ever legally advance them — see IMPLEMENTATION_PROGRESS.md.
 */

// ---- MiniGameContext builders ---------------------------------------------------------------

function buildMiniGameContext(room: RoomState): MiniGameContext {
  if (!room.currentRound) {
    throw new Error('buildMiniGameContext: no currentRound');
  }
  return {
    roomId: room.roomId,
    minigameId: room.currentRound.minigameId,
    participantIds: room.currentRound.participantIds,
    corrupted: room.currentRound.corrupted,
    config: null,
  };
}

function buildSpecialGameContext(room: RoomState): MiniGameContext {
  if (!room.currentSpecialRound) {
    throw new Error('buildSpecialGameContext: no currentSpecialRound');
  }
  return {
    roomId: room.roomId,
    minigameId: 'generic-special-game',
    participantIds: room.currentSpecialRound.participantIds,
    corrupted: false,
    config: null,
  };
}

// ---- Core transition + auto-advance ---------------------------------------------------------

function transition(room: RoomState, priv: RoomPrivateState, next: GameState, deps: Deps): void {
  room.phase = {
    state: next,
    phaseId: deps.generateId(),
    phaseStartedAt: deps.now(),
    durationMs: durationFor(next, room),
  };
  room.currentPhaseSubmissions = {};
  room.stateVersion += 1;
  room.updatedAt = deps.now();
  autoAdvance(room, priv, deps);
}

function autoAdvance(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  switch (room.phase.state) {
    case 'ROLE_ASSIGNMENT':
      performRoleAssignment(room, priv, deps);
      transition(room, priv, 'ROLE_REVEAL', deps);
      return;
    case 'MINIGAME_SELECT':
      performMinigameSelect(room, deps);
      transition(room, priv, 'HACKER_CORRUPTION', deps);
      return;
    case 'HACKER_CORRUPTION':
      if (room.firewallActive) {
        resolveFirewallBlock(room, deps);
        proceedToInstructions(room, priv, deps);
      }
      return;
    default:
      return;
  }
}

// ---- Role assignment --------------------------------------------------------------------------

function performRoleAssignment(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  const resolveHackerCount = roleBalanceRegistry[room.config.roleBalance.roleBalanceRuleId];
  if (!resolveHackerCount) {
    throw new Error(`Unknown roleBalanceRuleId: ${room.config.roleBalance.roleBalanceRuleId}`);
  }
  const playerCount = getPlayerCount(room);
  const raw = resolveHackerCount(playerCount, deps);
  const hackerCount = Math.max(room.config.roleBalance.minHackers, Math.min(room.config.roleBalance.maxHackers, raw, playerCount));

  const hackers = randomSubset(getAllPlayers(room), hackerCount, deps.rng);
  const hackerIds = new Set(hackers.map((p) => p.playerId));

  for (const player of getAllPlayers(room)) {
    const privatePlayer = priv.players[player.playerId];
    if (privatePlayer) {
      privatePlayer.role = hackerIds.has(player.playerId) ? 'HACKER' : 'CREW';
    }
  }

  room.cycle = 1;
  room.roundInCycle = 0;
  room.firewallActive = false;
  room.specialGameUsed = false;
  room.matchClock = initMatchClock(room.config);
}

// ---- Regular mini-game round setup -------------------------------------------------------------

function performMinigameSelect(room: RoomState, deps: Deps): void {
  const selectRule = minigameSelectionRegistry[room.config.minigameSelection.minigameSelectionRuleId];
  if (!selectRule) {
    throw new Error(`Unknown minigameSelectionRuleId: ${room.config.minigameSelection.minigameSelectionRuleId}`);
  }
  const availableIds = Object.keys(minigameRegistry);
  const minigameId = selectRule(room, deps, availableIds);
  const module = getMinigameModule(minigameId);

  room.roundInCycle += 1;
  room.currentRound = {
    cycle: room.cycle,
    roundInCycle: room.roundInCycle,
    minigameId,
    minigameVersion: module.version,
    participantIds: getEligibleMinigamePlayers(room).map((p) => p.playerId),
    corrupted: false,
    corruptionRevealed: false,
    moduleState: null,
    lastSeq: {},
    recentActionIds: {},
    startedAt: deps.now(),
  };
}

// ---- Corruption resolution ----------------------------------------------------------------------

function resolveFirewallBlock(room: RoomState, deps: Deps): void {
  if (!room.currentRound) return;
  room.currentRound.corrupted = false;
  room.firewallActive = false;
  room.matchLog.push({ at: deps.now(), type: 'firewall_consumed', detail: { cycle: room.cycle, roundInCycle: room.roundInCycle } });
}

function finalizeCorruptionChoices(room: RoomState, priv: RoomPrivateState): void {
  if (!room.currentRound) return;
  const aggregate = corruptionAggregationRegistry[room.config.corruption.aggregationRuleId];
  room.currentRound.corrupted = aggregate ? aggregate(priv.currentCorruptionChoices) : false;
  priv.currentCorruptionChoices = {};
}

function applyCorruptionRevealAtInstructions(room: RoomState): void {
  if (room.currentRound && room.config.rules.corruptionRevealPolicy === 'on_instructions') {
    room.currentRound.corruptionRevealed = true;
  }
}

function applyCorruptionRevealAtResults(room: RoomState): void {
  if (room.currentRound && room.config.rules.corruptionRevealPolicy === 'on_results') {
    room.currentRound.corruptionRevealed = true;
  }
}

function proceedToInstructions(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  if (!room.currentRound) return;
  applyCorruptionRevealAtInstructions(room);
  const module = getMinigameModule(room.currentRound.minigameId);
  room.currentRound.moduleState = module.start(buildMiniGameContext(room));
  transition(room, priv, 'MINIGAME_INSTRUCTIONS', deps);
}

// ---- Regular mini-game completion -----------------------------------------------------------

function completeMinigame(room: RoomState, priv: RoomPrivateState, reason: 'completed' | 'timeout' | 'forced', deps: Deps): void {
  if (!room.currentRound) return;
  const module = getMinigameModule(room.currentRound.minigameId);
  const result = module.resolve(room.currentRound.moduleState, reason);
  applyCorruptionRevealAtResults(room);
  room.roundHistory.push({
    cycle: room.currentRound.cycle,
    roundInCycle: room.currentRound.roundInCycle,
    minigameId: room.currentRound.minigameId,
    minigameVersion: room.currentRound.minigameVersion,
    corrupted: room.currentRound.corrupted,
    corruptionRevealed: room.currentRound.corruptionRevealed,
    success: result.success,
    scoreDeltas: result.scoreDeltas,
    resultSummary: result.resultSummary,
    startedAt: room.currentRound.startedAt,
    endedAt: deps.now(),
  });
  transition(room, priv, 'RESULTS_REVEAL', deps);
}

// ---- Special game due-check + setup, shared by DISCUSSION and SPECIAL_GAME_RESULT ------------

function resolveAfterRoundOrSpecial(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  if (!room.specialGameUsed) {
    const scheduleRule = specialGameScheduleRegistry[room.config.specialGame.specialGameScheduleRuleId];
    if (scheduleRule && scheduleRule(room, deps)) {
      beginSpecialGame(room, deps);
      transition(room, priv, 'SPECIAL_GAME_INTRO', deps);
      return;
    }
  }
  if (room.roundInCycle < room.config.rules.roundsPerCycle) {
    transition(room, priv, 'MINIGAME_SELECT', deps);
    return;
  }
  transition(room, priv, 'FINAL_DISCUSSION', deps);
}

function beginSpecialGame(room: RoomState, deps: Deps): void {
  const participantRule = specialGameParticipantRegistry[room.config.specialGame.specialGameParticipantRuleId];
  const raw = participantRule ? participantRule(room, deps) : room.config.specialGame.minParticipants;
  const pool = getEligibleSpecialGamePool(room);
  const count = Math.max(room.config.specialGame.minParticipants, Math.min(room.config.specialGame.maxParticipants, raw, pool.length));
  const participants = randomSubset(pool, count, deps.rng);

  room.currentSpecialRound = {
    cycle: room.cycle,
    participantIds: participants.map((p) => p.playerId),
    moduleState: null,
    lastSeq: {},
    recentActionIds: {},
    startedAt: deps.now(),
  };
  room.specialGameUsed = true; // locked immediately, can never re-trigger this match
}

function completeSpecialGame(room: RoomState, priv: RoomPrivateState, reason: 'completed' | 'timeout' | 'forced', deps: Deps): void {
  if (!room.currentSpecialRound) return;
  const module = getSpecialGameModule();
  const result = module.resolve(room.currentSpecialRound.moduleState, reason);
  room.specialRoundHistory.push({
    cycle: room.currentSpecialRound.cycle,
    participantIds: room.currentSpecialRound.participantIds,
    success: result.success,
    scoreDeltas: result.scoreDeltas,
    resultSummary: result.resultSummary,
    startedAt: room.currentSpecialRound.startedAt,
    endedAt: deps.now(),
  });
  transition(room, priv, 'SPECIAL_GAME_RESULT', deps);
}

// ---- Voting --------------------------------------------------------------------------------

function maybeResolveVoting(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  if (!room.currentVote) return;
  const eligible = getEligibleVoters(room);
  if (eligible.length > 0 && eligible.every((p) => p.playerId in room.currentVote!.votes)) {
    resolveVoting(room, priv, deps);
  }
}

function resolveVoting(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  if (!room.currentVote) return;
  const eligible = getEligibleVoters(room);
  for (const p of eligible) {
    if (!(p.playerId in room.currentVote.votes)) {
      room.currentVote.votes[p.playerId] = 'skip';
    }
  }

  const isRevoteAttempt = room.currentVote.revoteOf !== null;
  const result = tally(room.currentVote.votes, room.config.rules.tieBreakRule, deps.rng, isRevoteAttempt);

  if (result.shouldRevote) {
    room.currentVote = { cycle: room.cycle, votes: {}, startedAt: deps.now(), revoteOf: result.tiedTargetIds };
    transition(room, priv, 'VOTING', deps);
    return;
  }

  room.voteHistory.push({
    cycle: room.cycle,
    votes: room.currentVote.votes,
    eliminatedPlayerId: result.eliminatedPlayerId,
    tie: result.tie,
  });
  if (result.eliminatedPlayerId) {
    const player = room.players[result.eliminatedPlayerId];
    if (player) player.alive = false;
  }
  room.currentVote = null;
  transition(room, priv, 'ELIMINATION_RESULT', deps);
}

// ---- Match reset (rematch) -------------------------------------------------------------------

function resetMatchScopedState(room: RoomState, priv: RoomPrivateState): void {
  room.cycle = 0;
  room.roundInCycle = 0;
  room.firewallActive = false;
  room.specialGameUsed = false;
  room.winner = null;
  room.matchClock = initMatchClock(room.config);
  room.currentRound = null;
  room.currentSpecialRound = null;
  room.currentVote = null;
  room.roundHistory = [];
  room.specialRoundHistory = [];
  room.voteHistory = [];
  room.matchLog = [];
  for (const player of Object.values(room.players)) {
    player.alive = true;
  }
  for (const p of Object.values(priv.players)) {
    p.role = null;
  }
  priv.currentCorruptionChoices = {};
}

// ---- Disconnect handling (not phase-gated — can happen in any state) -------------------------

function handlePlayerDisconnected(room: RoomState, playerId: string): void {
  const player = room.players[playerId];
  if (player) {
    player.connectionStatus = 'disconnected';
  }
  if (room.currentRound?.participantIds.includes(playerId)) {
    const module = getMinigameModule(room.currentRound.minigameId);
    room.currentRound.moduleState = module.handleDisconnect(room.currentRound.moduleState, playerId);
  }
  if (room.currentSpecialRound?.participantIds.includes(playerId)) {
    const module = getSpecialGameModule();
    room.currentSpecialRound.moduleState = module.handleDisconnect(room.currentSpecialRound.moduleState, playerId);
  }
}

// ---- Per-state handlers ----------------------------------------------------------------------

function handleLobby(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'host:startGame') {
    const count = getPlayerCount(room);
    if (count < room.config.rules.minPlayers || count > room.config.rules.maxPlayers) {
      return rejected(room, priv, 'INVALID_PLAYER_COUNT');
    }
    transition(room, priv, 'ROLE_ASSIGNMENT', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleRoleReveal(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'player:acknowledgeReveal') {
    if (!room.players[event.playerId]) return rejected(room, priv, 'NOT_PARTICIPANT');
    if (hasSubmittedThisPhase(room, event.playerId)) return rejected(room, priv, 'DUPLICATE_ACTION');
    recordSubmission(room, event.playerId);
    const connected = getConnectedPlayers(room);
    if (connected.length > 0 && connected.every((p) => hasSubmittedThisPhase(room, p.playerId))) {
      transition(room, priv, 'GAME_INTRO', deps);
    }
    return ok(room, priv);
  }
  if (event.type === 'host:skipRevealTimer' || event.type === 'timer:expired') {
    transition(room, priv, 'GAME_INTRO', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleGameIntro(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'host:skipIntro' || event.type === 'timer:expired') {
    transition(room, priv, 'MINIGAME_SELECT', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleHackerCorruption(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (!room.currentRound) return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');

  if (event.type === 'player:submitCorruptionChoice') {
    if (!isHacker(priv, event.playerId)) return rejected(room, priv, 'NOT_HACKER');
    if (hasSubmittedThisPhase(room, event.playerId)) return rejected(room, priv, 'DUPLICATE_ACTION');
    recordSubmission(room, event.playerId);
    priv.currentCorruptionChoices[event.playerId] = event.corrupt;

    const hackerIds = getHackerIds(priv);
    if (hackerIds.length > 0 && hackerIds.every((id) => hasSubmittedThisPhase(room, id))) {
      finalizeCorruptionChoices(room, priv);
      proceedToInstructions(room, priv, deps);
    }
    return ok(room, priv);
  }

  if (event.type === 'timer:expired') {
    finalizeCorruptionChoices(room, priv);
    proceedToInstructions(room, priv, deps);
    return ok(room, priv);
  }

  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleMinigameInstructions(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'host:skipInstructions' || event.type === 'timer:expired') {
    transition(room, priv, 'MINIGAME_PLAY', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleMinigamePlay(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (!room.currentRound) return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
  const module = getMinigameModule(room.currentRound.minigameId);

  if (event.type === 'player:submitAction') {
    const round = room.currentRound;
    if (!round.participantIds.includes(event.playerId)) {
      return rejected(room, priv, 'NOT_PARTICIPANT');
    }
    const recentIds = round.recentActionIds[event.playerId] ?? [];
    if (recentIds.includes(event.actionId)) {
      return ok(room, priv); // harmless retry, already applied
    }
    const lastSeq = round.lastSeq[event.playerId] ?? 0;
    if (event.seq <= lastSeq) {
      return rejected(room, priv, 'OUT_OF_ORDER');
    }
    const ctx = buildMiniGameContext(room);
    const validation = module.validateAction(round.moduleState, event.playerId, ctx, event.data);
    if (!validation.valid) {
      return rejected(room, priv, 'INVALID_ACTION', validation.reason);
    }
    round.moduleState = module.handleAction(round.moduleState, event.playerId, event.data);
    round.lastSeq[event.playerId] = event.seq;
    round.recentActionIds[event.playerId] = [...recentIds, event.actionId].slice(-20);

    if (module.isComplete(round.moduleState)) {
      completeMinigame(room, priv, 'completed', deps);
    }
    return ok(room, priv);
  }

  if (event.type === 'timer:expired') {
    completeMinigame(room, priv, 'timeout', deps);
    return ok(room, priv);
  }
  if (event.type === 'host:forceEndMinigame') {
    completeMinigame(room, priv, 'forced', deps);
    return ok(room, priv);
  }

  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleResultsReveal(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'host:skipResultsReveal' || event.type === 'timer:expired') {
    room.currentRound = null;
    transition(room, priv, 'DISCUSSION', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleDiscussion(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'host:endDiscussionEarly' || event.type === 'timer:expired') {
    resolveAfterRoundOrSpecial(room, priv, deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleSpecialGameIntro(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'host:skipSpecialIntro' || event.type === 'timer:expired') {
    if (room.currentSpecialRound) {
      const module = getSpecialGameModule();
      room.currentSpecialRound.moduleState = module.start(buildSpecialGameContext(room));
    }
    transition(room, priv, 'SPECIAL_GAME_PLAY', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleSpecialGamePlay(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (!room.currentSpecialRound) return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
  const module = getSpecialGameModule();

  if (event.type === 'player:submitAction') {
    const round = room.currentSpecialRound;
    if (!round.participantIds.includes(event.playerId)) {
      return rejected(room, priv, 'NOT_PARTICIPANT');
    }
    const recentIds = round.recentActionIds[event.playerId] ?? [];
    if (recentIds.includes(event.actionId)) {
      return ok(room, priv);
    }
    const lastSeq = round.lastSeq[event.playerId] ?? 0;
    if (event.seq <= lastSeq) {
      return rejected(room, priv, 'OUT_OF_ORDER');
    }
    const ctx = buildSpecialGameContext(room);
    const validation = module.validateAction(round.moduleState, event.playerId, ctx, event.data);
    if (!validation.valid) {
      return rejected(room, priv, 'INVALID_ACTION', validation.reason);
    }
    round.moduleState = module.handleAction(round.moduleState, event.playerId, event.data);
    round.lastSeq[event.playerId] = event.seq;
    round.recentActionIds[event.playerId] = [...recentIds, event.actionId].slice(-20);

    if (module.isComplete(round.moduleState)) {
      completeSpecialGame(room, priv, 'completed', deps);
    }
    return ok(room, priv);
  }

  if (event.type === 'timer:expired') {
    completeSpecialGame(room, priv, 'timeout', deps);
    return ok(room, priv);
  }
  if (event.type === 'host:forceEndSpecialGame') {
    completeSpecialGame(room, priv, 'forced', deps);
    return ok(room, priv);
  }

  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleSpecialGameResult(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'timer:expired' || event.type === 'host:advance') {
    const last = room.specialRoundHistory[room.specialRoundHistory.length - 1];
    if (last) {
      if (last.success) {
        room.firewallActive = true;
        room.matchLog.push({ at: deps.now(), type: 'firewall_activated', detail: { cycle: room.cycle } });
      } else if (room.matchClock.mode === 'countdown') {
        room.matchClock.durationMs = Math.max(0, (room.matchClock.durationMs ?? 0) - room.config.specialGame.failPenaltyMs);
        room.matchClock.penaltyMs += room.config.specialGame.failPenaltyMs;
        room.matchLog.push({ at: deps.now(), type: 'penalty_applied', detail: { ms: room.config.specialGame.failPenaltyMs } });
      } else {
        room.matchLog.push({
          at: deps.now(),
          type: 'penalty_applied',
          detail: { ms: room.config.specialGame.failPenaltyMs, note: 'matchClock disabled, no gameplay effect' },
        });
      }
    }
    room.currentSpecialRound = null;
    resolveAfterRoundOrSpecial(room, priv, deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleFinalDiscussion(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'host:endDiscussionEarly' || event.type === 'timer:expired') {
    room.currentVote = { cycle: room.cycle, votes: {}, startedAt: deps.now(), revoteOf: null };
    transition(room, priv, 'VOTING', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleVoting(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (!room.currentVote) return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');

  if (event.type === 'player:submitVote') {
    if (!isEligibleVoter(room, event.playerId)) return rejected(room, priv, 'NOT_ELIGIBLE_VOTER');
    if (hasSubmittedThisPhase(room, event.playerId)) return rejected(room, priv, 'DUPLICATE_ACTION');

    const allowedTargets = room.currentVote.revoteOf;
    if (allowedTargets && event.targetPlayerId !== 'skip' && !allowedTargets.includes(event.targetPlayerId)) {
      return rejected(room, priv, 'INVALID_ACTION', 'Target is not one of the tied candidates for this revote');
    }

    recordSubmission(room, event.playerId);
    room.currentVote.votes[event.playerId] = event.targetPlayerId;
    maybeResolveVoting(room, priv, deps);
    return ok(room, priv);
  }

  if (event.type === 'timer:expired' || event.type === 'host:endVoteEarly') {
    resolveVoting(room, priv, deps);
    return ok(room, priv);
  }

  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleEliminationResult(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'timer:expired' || event.type === 'host:advance') {
    const winner = checkWinCondition(room, priv);
    if (winner) {
      room.winner = winner;
      transition(room, priv, 'FINAL_RESULTS', deps);
      return ok(room, priv);
    }
    if (room.cycle >= room.config.rules.maxCycles) {
      room.winner = 'crew'; // placeholder default, NOT a design decision — see ARCHITECTURE.md §12
      transition(room, priv, 'FINAL_RESULTS', deps);
      return ok(room, priv);
    }
    room.cycle += 1;
    room.roundInCycle = 0;
    transition(room, priv, 'MINIGAME_SELECT', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleFinalResults(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'player:requestRematch') {
    if (hasSubmittedThisPhase(room, event.playerId)) return rejected(room, priv, 'DUPLICATE_ACTION');
    recordSubmission(room, event.playerId);
    return ok(room, priv);
  }
  if (event.type === 'host:advance') {
    transition(room, priv, 'REMATCH_LOBBY', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function handleRematchLobby(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'host:startGame') {
    resetMatchScopedState(room, priv);
    transition(room, priv, 'LOBBY', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

// ---- Entry point -----------------------------------------------------------------------------

export function handleEvent(room: RoomState, priv: RoomPrivateState, event: InboundEvent, sender: EventSender, deps: Deps): HandleEventResult {
  const nextRoom = structuredClone(room);
  const nextPriv = structuredClone(priv);

  const senderProblem = checkSenderMatchesEvent(event, sender);
  if (senderProblem) {
    return rejected(nextRoom, nextPriv, senderProblem);
  }

  // Disconnects, closeRoom, and restartMatch are valid across (almost) any state and bypass the
  // phaseId/state switch below entirely.
  if (event.type === 'player:disconnected') {
    handlePlayerDisconnected(nextRoom, event.playerId);
    return ok(nextRoom, nextPriv);
  }
  if (event.type === 'host:closeRoom' || event.type === 'host:graceExpired') {
    if (nextRoom.phase.state !== 'ABANDONED') {
      transition(nextRoom, nextPriv, 'ABANDONED', deps);
    }
    return ok(nextRoom, nextPriv);
  }
  if (event.type === 'host:restartMatch') {
    if (nextRoom.phase.state !== 'FINAL_RESULTS' && nextRoom.phase.state !== 'REMATCH_LOBBY') {
      return rejected(nextRoom, nextPriv, 'INVALID_EVENT_FOR_STATE');
    }
    resetMatchScopedState(nextRoom, nextPriv);
    transition(nextRoom, nextPriv, 'LOBBY', deps);
    return ok(nextRoom, nextPriv);
  }

  if (isStalePhase(nextRoom, event)) {
    return rejected(nextRoom, nextPriv, 'STALE_PHASE');
  }

  switch (nextRoom.phase.state) {
    case 'LOBBY':
      return handleLobby(nextRoom, nextPriv, event, deps);
    case 'ROLE_REVEAL':
      return handleRoleReveal(nextRoom, nextPriv, event, deps);
    case 'GAME_INTRO':
      return handleGameIntro(nextRoom, nextPriv, event, deps);
    case 'HACKER_CORRUPTION':
      return handleHackerCorruption(nextRoom, nextPriv, event, deps);
    case 'MINIGAME_INSTRUCTIONS':
      return handleMinigameInstructions(nextRoom, nextPriv, event, deps);
    case 'MINIGAME_PLAY':
      return handleMinigamePlay(nextRoom, nextPriv, event, deps);
    case 'RESULTS_REVEAL':
      return handleResultsReveal(nextRoom, nextPriv, event, deps);
    case 'DISCUSSION':
      return handleDiscussion(nextRoom, nextPriv, event, deps);
    case 'SPECIAL_GAME_INTRO':
      return handleSpecialGameIntro(nextRoom, nextPriv, event, deps);
    case 'SPECIAL_GAME_PLAY':
      return handleSpecialGamePlay(nextRoom, nextPriv, event, deps);
    case 'SPECIAL_GAME_RESULT':
      return handleSpecialGameResult(nextRoom, nextPriv, event, deps);
    case 'FINAL_DISCUSSION':
      return handleFinalDiscussion(nextRoom, nextPriv, event, deps);
    case 'VOTING':
      return handleVoting(nextRoom, nextPriv, event, deps);
    case 'ELIMINATION_RESULT':
      return handleEliminationResult(nextRoom, nextPriv, event, deps);
    case 'FINAL_RESULTS':
      return handleFinalResults(nextRoom, nextPriv, event, deps);
    case 'REMATCH_LOBBY':
      return handleRematchLobby(nextRoom, nextPriv, event, deps);
    default:
      return rejected(nextRoom, nextPriv, 'INVALID_EVENT_FOR_STATE');
  }
}
