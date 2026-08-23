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
import { checkSenderMatchesEvent, hasSubmittedThisPhase, isEligibleVoter, isHacker, isStalePhase, recordSubmission } from './guards.js';
import { ok, rejected, type HandleEventResult } from './result.js';
import { durationFor } from './durations.js';
import { applyPenalty, initMatchClock, pauseMatchClock, resumeMatchClock, startMatchClock, stopMatchClock } from './match-clock.js';
import { randomSubset, shuffle } from './random.js';
import { getMinigameModule, getSpecialGameModule, minigameRegistry } from '../minigames/registry.js';
import { assignRankItInstructions, RANK_IT_FIXTURE } from '../minigames/rank-it-content.js';
import { assignCompleteItPrompts } from '../minigames/complete-it-content.js';
import { assignPredictThemPrompts, PREDICT_THEM_FIXTURE } from '../minigames/predict-them-content.js';
import { assignDrawItPrompts } from '../minigames/draw-it-content.js';
import { assignDescribeItWords, DESCRIBE_IT_FIXTURE } from '../minigames/describe-it-content.js';
import { assignDefendItStatements, DEFEND_IT_FIXTURE } from '../minigames/defend-it-content.js';
import { DEFEND_IT_FOLLOW_UP_STRATEGY, selectRandomFollowUpAskers } from '../minigames/defend-it-selection.js';
import { createBombProtocolConfig } from '../minigames/bomb-protocol-content.js';
import {
  minigameSelectionRegistry,
  roleBalanceRegistry,
  specialGameParticipantRegistry,
  specialGameScheduleRegistry,
} from '../rules/registries.js';
import { getParticipantLimit } from '../rules/participant-limits.js';
import { ACCUSATION_ALLOWED_STATES } from '../rules/accusation.js';

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
    config: null,
  };
}

function buildSpecialGameContext(room: RoomState): MiniGameContext {
  if (!room.currentSpecialRound) {
    throw new Error('buildSpecialGameContext: no currentSpecialRound');
  }
  return {
    roomId: room.roomId,
    minigameId: 'BOMB_PROTOCOL',
    participantIds: room.currentSpecialRound.participantIds,
    config: null,
  };
}

// ---- Core transition + auto-advance ---------------------------------------------------------

/** Sets `room.phase` to `next` without running `autoAdvance()` — the rare case that needs the raw mutation without any auto-advance side effect (see `returnToGameplayAfterAccusation`'s MINIGAME_SELECT case, which must NOT re-run `assignNextAdmin()`). Every other call site should use `transition()` instead. */
function setPhase(room: RoomState, next: GameState, deps: Deps): void {
  room.phase = {
    state: next,
    phaseId: deps.generateId(),
    phaseStartedAt: deps.now(),
    durationMs: durationFor(next, room),
  };
  room.currentPhaseSubmissions = {};
  room.stateVersion += 1;
  room.updatedAt = deps.now();
}

function transition(room: RoomState, priv: RoomPrivateState, next: GameState, deps: Deps): void {
  setPhase(room, next, deps);
  autoAdvance(room, priv, deps);
}

function autoAdvance(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  switch (room.phase.state) {
    case 'ROLE_ASSIGNMENT':
      performRoleAssignment(room, priv, deps);
      transition(room, priv, 'ROLE_REVEAL', deps);
      return;
    case 'MINIGAME_SELECT':
      // No longer instant: the Admin now actively chooses the minigame + participants
      // (GAMEPLAY_RULES_V1.md §4/§5). This just rotates who holds Admin for the round and then
      // genuinely waits for `player:adminSelectMinigame` or a selection-timeout `timer:expired`.
      assignNextAdmin(room, deps);
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

/**
 * Rotates the Admin queue (GAMEPLAY_RULES_V1.md §4): shuffles a fresh queue from the currently
 * eligible pool whenever the previous one empties (or a player who was queued becomes ineligible,
 * e.g. eliminated), guaranteeing no Admin repeats before every eligible player has had a turn.
 */
function assignNextAdmin(room: RoomState, deps: Deps): void {
  const eligibleIds = getEligibleMinigamePlayers(room).map((p) => p.playerId);
  room.adminQueue = room.adminQueue.filter((id) => eligibleIds.includes(id));
  if (room.adminQueue.length === 0 && eligibleIds.length > 0) {
    room.adminQueue = shuffle(eligibleIds, deps.rng);
  }
  room.adminId = room.adminQueue.shift() ?? null;
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
  // Public from the moment roles are assigned (GAMEPLAY_RULES_V1.md accusation §2) — the COUNT
  // only, never who; nothing else on RoomState exposes identities without going through priv.
  room.hackerCount = hackerIds.size;

  for (const player of getAllPlayers(room)) {
    const privatePlayer = priv.players[player.playerId];
    if (privatePlayer) {
      const role = hackerIds.has(player.playerId) ? 'HACKER' : 'CREW';
      privatePlayer.role = role;
      priv.hacksRemaining[player.playerId] = role === 'HACKER' ? 2 : 0;
    }
  }

  room.cycle = 1;
  room.roundInCycle = 0;
  room.firewallActive = false;
  room.specialGameUsed = false;
  room.adminId = null;
  room.adminQueue = [];
  // Not started yet — the match clock begins only once GAME_INTRO exits (GAMEPLAY_RULES_V1.md §2).
  room.matchClock = initMatchClock();
}

// ---- Regular mini-game round setup (Admin-driven — GAMEPLAY_RULES_V1.md §4/§5) -----------------

/**
 * For PREDICT_THEM only, the Admin's selection is the "predictor" subset — everyone else still
 * eligible becomes the audience automatically. Every other game's final participant set is exactly
 * what the Admin chose. This is the ONLY minigame-specific branching left in round setup; every
 * other per-game difference (participant count) is data, not code — see rules/participant-limits.ts.
 */
function expandParticipantsForMinigame(room: RoomState, minigameId: string, selectedIds: string[]): string[] {
  if (minigameId !== 'PREDICT_THEM') return selectedIds;
  const eligibleIds = getEligibleMinigamePlayers(room).map((p) => p.playerId);
  const audienceIds = eligibleIds.filter((id) => !selectedIds.includes(id));
  return [...selectedIds, ...audienceIds];
}

function beginNormalRound(room: RoomState, minigameId: string, participantIds: string[], adminSelectedParticipantIds: string[], deps: Deps): void {
  const module = getMinigameModule(minigameId);
  room.roundInCycle += 1;
  room.currentRound = {
    cycle: room.cycle,
    roundInCycle: room.roundInCycle,
    minigameId,
    minigameVersion: module.version,
    adminId: room.adminId ?? '',
    adminSelectedParticipantIds,
    participantIds,
    hackedPlayerIds: [],
    hackerActionsUsed: {},
    hackedPlayerIdsRevealed: false,
    moduleState: null,
    lastSeq: {},
    recentActionIds: {},
    startedAt: deps.now(),
  };
}

/** Timeout fallback when the Admin never acts (GAMEPLAY_RULES_V1.md §4) — the match must never stall on one player. */
function autoSelectMinigameAndParticipants(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  const selectRule = minigameSelectionRegistry[room.config.minigameSelection.minigameSelectionRuleId];
  const availableIds = Object.keys(minigameRegistry);
  const minigameId = selectRule ? selectRule(room, deps, availableIds) : availableIds[0]!;
  const limit = getParticipantLimit(minigameId) ?? { min: 2, max: 2 };
  const pool = getEligibleMinigamePlayers(room).map((p) => p.playerId);
  const desiredCount = Math.max(limit.min, Math.min(limit.max, pool.length));
  let selectedIds = randomSubset(pool, desiredCount, deps.rng);
  // Predict Them needs at least one eligible player left over as the audience.
  if (minigameId === 'PREDICT_THEM' && selectedIds.length > 0 && pool.length - selectedIds.length < 1) {
    selectedIds = selectedIds.slice(0, Math.max(limit.min - 1, 0) || selectedIds.length - 1);
  }
  const finalParticipantIds = expandParticipantsForMinigame(room, minigameId, selectedIds);
  beginNormalRound(room, minigameId, finalParticipantIds, selectedIds, deps);
  transition(room, priv, 'HACKER_CORRUPTION', deps);
}

// ---- Hack window (targeted, budgeted — GAMEPLAY_RULES_V1.md §7) --------------------------------

function resolveFirewallBlock(room: RoomState, deps: Deps): void {
  if (!room.currentRound) return;
  room.firewallActive = false;
  room.matchLog.push({ at: deps.now(), type: 'firewall_consumed', detail: { cycle: room.cycle, roundInCycle: room.roundInCycle } });
}

function applyHackRevealAtInstructions(room: RoomState): void {
  if (room.currentRound && room.config.rules.corruptionRevealPolicy === 'on_instructions') {
    room.currentRound.hackedPlayerIdsRevealed = true;
  }
}

function applyHackRevealAtResults(room: RoomState): void {
  if (room.currentRound && room.config.rules.corruptionRevealPolicy === 'on_results') {
    room.currentRound.hackedPlayerIdsRevealed = true;
  }
}

function proceedToInstructions(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  if (!room.currentRound) return;
  applyHackRevealAtInstructions(room);
  const module = getMinigameModule(room.currentRound.minigameId);
  const ctx = buildMiniGameContext(room);
  const roles = Object.fromEntries(Object.entries(priv.players).map(([id, player]) => [id, player.role]));
  // The Admin already chose the exact, validated participant set (rules/participant-limits.ts) —
  // there is no per-game re-sampling left to do here, only assembling each module's own config
  // shape around that fixed set.
  const hackedPlayerIds = new Set(room.currentRound.hackedPlayerIds);
  const participantIds = room.currentRound.participantIds;

  if (room.currentRound.minigameId === 'RANK_IT') {
    // Independently shuffled starting card order per participant (GAMEPLAY_RULES_V1.md RANK_IT) —
    // a shared identical default order could otherwise read as intentional if someone times out.
    const cardIds = RANK_IT_FIXTURE.cards.map((c) => c.id);
    ctx.config = {
      cards: RANK_IT_FIXTURE.cards.map((c) => ({ id: c.id, text: c.text })),
      promptAssignments: assignRankItInstructions(participantIds, roles, hackedPlayerIds),
      initialOrder: Object.fromEntries(participantIds.map((id) => [id, shuffle(cardIds, deps.rng)])),
    };
  } else if (room.currentRound.minigameId === 'COMPLETE_IT') {
    ctx.config = { promptAssignments: assignCompleteItPrompts(participantIds, roles, hackedPlayerIds) };
  } else if (room.currentRound.minigameId === 'PREDICT_THEM') {
    const selectedPlayerIds = room.currentRound.adminSelectedParticipantIds;
    ctx.config = {
      selectedPlayerIds,
      audienceQuestion: PREDICT_THEM_FIXTURE.audienceQuestion,
      optionA: PREDICT_THEM_FIXTURE.optionA,
      optionB: PREDICT_THEM_FIXTURE.optionB,
      promptAssignments: assignPredictThemPrompts(selectedPlayerIds, roles, hackedPlayerIds),
    };
  } else if (room.currentRound.minigameId === 'DRAW_IT') {
    ctx.config = { promptAssignments: assignDrawItPrompts(participantIds, roles, hackedPlayerIds) };
  } else if (room.currentRound.minigameId === 'DESCRIBE_IT') {
    ctx.config = {
      speakerOrder: shuffle(participantIds, deps.rng),
      promptAssignments: assignDescribeItWords(participantIds, roles, hackedPlayerIds),
      crewWord: DESCRIBE_IT_FIXTURE.crewVariant,
      hackerWord: DESCRIBE_IT_FIXTURE.hackerVariant,
    };
  } else if (room.currentRound.minigameId === 'DEFEND_IT') {
    const speakerOrder = shuffle(participantIds, deps.rng);
    ctx.config = {
      speakerOrder,
      statementAssignments: assignDefendItStatements(participantIds, roles, hackedPlayerIds),
      statements: [DEFEND_IT_FIXTURE.crewVariant, DEFEND_IT_FIXTURE.hackerVariant],
      followUpStrategy: DEFEND_IT_FOLLOW_UP_STRATEGY,
      followUpAskerIds: selectRandomFollowUpAskers(speakerOrder, deps.rng),
    };
  }
  room.currentRound.moduleState = module.start(ctx);
  transition(room, priv, 'MINIGAME_INSTRUCTIONS', deps);
}

// ---- Regular mini-game completion -----------------------------------------------------------

function completeMinigame(room: RoomState, priv: RoomPrivateState, reason: 'completed' | 'timeout' | 'forced', deps: Deps): void {
  if (!room.currentRound) return;
  const module = getMinigameModule(room.currentRound.minigameId);
  const result = module.resolve(room.currentRound.moduleState, reason);
  applyHackRevealAtResults(room);
  room.roundHistory.push({
    cycle: room.currentRound.cycle,
    roundInCycle: room.currentRound.roundInCycle,
    minigameId: room.currentRound.minigameId,
    minigameVersion: room.currentRound.minigameVersion,
    adminId: room.currentRound.adminId,
    hackedPlayerIds: room.currentRound.hackedPlayerIds,
    hackedPlayerIdsRevealed: room.currentRound.hackedPlayerIdsRevealed,
    success: result.success,
    scoreDeltas: result.scoreDeltas,
    resultSummary: result.resultSummary,
    startedAt: room.currentRound.startedAt,
    endedAt: deps.now(),
  });
  transition(room, priv, 'RESULTS_REVEAL', deps);
}

// ---- Special game due-check + setup, shared by DISCUSSION and SPECIAL_GAME_RESULT ------------

/**
 * The legacy periodic elimination vote (FINAL_DISCUSSION/VOTING/ELIMINATION_RESULT) was retired as
 * a PRODUCT decision (JACKOM final gameplay closure) — there is no automatic periodic
 * player-elimination vote in the final game. `room.roundsPerCycle`/`room.roundInCycle` now serve
 * exactly one purpose: gating WHEN the special game (Bomb Protocol) becomes due, via
 * `specialGameScheduleRegistry`'s `'placeholder-end-of-cycle-once'` rule below — they no longer
 * gate any voting/elimination cadence. After every normal round (special game due or not), play
 * always loops back to `MINIGAME_SELECT` for the next Admin. The match now ends only two ways:
 * a Push-the-Button accusation resolving (`resolveAccusationVote`, below), or the match clock
 * expiring (`matchClock:expired`, handled cross-cuttingly in `handleEvent`).
 */
function resolveAfterRoundOrSpecial(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  if (!room.specialGameUsed) {
    const scheduleRule = specialGameScheduleRegistry[room.config.specialGame.specialGameScheduleRuleId];
    if (scheduleRule && scheduleRule(room, deps)) {
      beginSpecialGame(room, deps);
      transition(room, priv, 'SPECIAL_GAME_INTRO', deps);
      return;
    }
  }
  transition(room, priv, 'MINIGAME_SELECT', deps);
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
  // The main match clock pauses for the entire special-game sequence (GAMEPLAY_RULES_V1.md §2) —
  // resumed (or ended) in handleSpecialGameResult once the outcome is known.
  room.matchClock = pauseMatchClock(room.matchClock, deps);
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

// ---- Accusation (final, high-stakes — Core Logic Phase 2A) ------------------------------------
//
// The ONE final-result mechanic in the game (the older per-cycle elimination vote — `currentVote`
// / `VOTING` / `ELIMINATION_RESULT` — was retired, see `resolveAfterRoundOrSpecial` above). An
// accusation is Crew's formal, match-ending bet on the complete Hacker set; it does not eliminate
// anyone by itself and does not touch the Admin rotation except where explicitly noted below.

/**
 * Returns to normal investigation gameplay after an accusation is rejected or cancelled (selection
 * timeout). `originState` is whichever allowed state the accusation interrupted:
 *  - 'MINIGAME_SELECT': the SAME Admin turn was interrupted mid-selection — resume it exactly,
 *    without reassigning the Admin or reshuffling the queue (hence `setPhase`, not `transition`,
 *    which would otherwise re-run `assignNextAdmin()` via `autoAdvance()`).
 *  - 'DISCUSSION': the round was already fully resolved before the accusation began — proceed
 *    normally into the next round's MINIGAME_SELECT, fresh Admin rotation included, exactly as if
 *    DISCUSSION's own timer/host-advance had fired directly.
 */
function returnToGameplayAfterAccusation(room: RoomState, priv: RoomPrivateState, deps: Deps, originState: 'DISCUSSION' | 'MINIGAME_SELECT'): void {
  if (originState === 'MINIGAME_SELECT') {
    setPhase(room, 'MINIGAME_SELECT', deps);
  } else {
    transition(room, priv, 'MINIGAME_SELECT', deps);
  }
}

function handlePushButton(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type !== 'player:pushButton') return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
  if (room.winner !== null) return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
  if (!ACCUSATION_ALLOWED_STATES.has(room.phase.state)) return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
  if (room.accusationCooldownUntil !== null && deps.now() < room.accusationCooldownUntil) {
    return rejected(room, priv, 'ACCUSATION_ON_COOLDOWN');
  }
  if (!isEligibleVoter(room, event.playerId)) return rejected(room, priv, 'NOT_ELIGIBLE_VOTER');

  const originState = room.phase.state as 'DISCUSSION' | 'MINIGAME_SELECT';
  room.currentAccusation = {
    initiatorId: event.playerId,
    requiredSuspectCount: room.hackerCount,
    suspectIds: null,
    eligibleVoterIds: [],
    votes: {},
    originState,
    startedAt: deps.now(),
  };
  room.matchLog.push({ at: deps.now(), type: 'accusation_started', detail: { initiatorId: event.playerId, requiredSuspectCount: room.hackerCount, originState } });
  transition(room, priv, 'ACCUSATION_SELECT', deps);
  return ok(room, priv);
}

function handleAccusationSelect(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  const acc = room.currentAccusation;
  if (!acc) return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');

  if (event.type === 'player:submitAccusation') {
    if (event.playerId !== acc.initiatorId) return rejected(room, priv, 'NOT_INITIATOR');

    const ids = event.suspectIds;
    if (new Set(ids).size !== ids.length) {
      return rejected(room, priv, 'INVALID_SUSPECTS', 'Duplicate suspect ids');
    }
    if (ids.length !== acc.requiredSuspectCount) {
      return rejected(room, priv, 'INVALID_SUSPECTS', `Must nominate exactly ${acc.requiredSuspectCount} suspect(s)`);
    }
    const eligibleIds = new Set(getEligibleVoters(room).map((p) => p.playerId));
    for (const id of ids) {
      if (!eligibleIds.has(id)) return rejected(room, priv, 'INVALID_SUSPECTS', `Player ${id} is not eligible to be nominated`);
    }

    acc.suspectIds = ids;
    acc.eligibleVoterIds = getEligibleVoters(room).map((p) => p.playerId);
    room.matchLog.push({ at: deps.now(), type: 'accusation_locked', detail: { suspectIds: ids } });
    transition(room, priv, 'ACCUSATION_VOTE', deps);
    return ok(room, priv);
  }

  if (event.type === 'timer:expired') {
    // Selection timeout (GAMEPLAY_RULES_V1.md accusation §9) — cancel outright, no cooldown: the
    // team is only out the match time that naturally elapsed, not an additional penalty.
    room.matchLog.push({ at: deps.now(), type: 'accusation_cancelled', detail: { initiatorId: acc.initiatorId, reason: 'selection_timeout' } });
    const originState = acc.originState;
    room.currentAccusation = null;
    returnToGameplayAfterAccusation(room, priv, deps, originState);
    return ok(room, priv);
  }

  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

function maybeResolveAccusationVote(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  const acc = room.currentAccusation;
  if (!acc || !acc.suspectIds) return;
  if (acc.eligibleVoterIds.length > 0 && acc.eligibleVoterIds.every((id) => id in acc.votes)) {
    resolveAccusationVote(room, priv, deps);
  }
}

/** Strict majority: APPROVE votes strictly greater than half of the (fixed, snapshotted) eligible voters. A tie always rejects. */
function resolveAccusationVote(room: RoomState, priv: RoomPrivateState, deps: Deps): void {
  const acc = room.currentAccusation;
  if (!acc || !acc.suspectIds) return;
  const suspectIds = acc.suspectIds;
  const total = acc.eligibleVoterIds.length;
  const approveCount = Object.values(acc.votes).filter((v) => v === 'APPROVE').length;
  const approved = total > 0 && approveCount > total / 2;

  if (!approved) {
    room.accusationHistory.push({
      initiatorId: acc.initiatorId,
      suspectIds,
      votes: acc.votes,
      approved: false,
      correct: null,
      startedAt: acc.startedAt,
      endedAt: deps.now(),
    });
    room.accusationCooldownUntil = deps.now() + room.config.rules.accusationCooldownMs;
    room.matchLog.push({ at: deps.now(), type: 'accusation_rejected', detail: { approveCount, total } });
    const originState = acc.originState;
    room.currentAccusation = null;
    returnToGameplayAfterAccusation(room, priv, deps, originState);
    return;
  }

  // Approved — the comparison against the real Hacker set happens ONLY here, server-side, never
  // sent to any client for resolution (GAMEPLAY_RULES_V1.md accusation §18).
  const hackerIds = new Set(Object.values(priv.players).filter((p) => p.role === 'HACKER').map((p) => p.playerId));
  const suspectSet = new Set(suspectIds);
  const correct = hackerIds.size === suspectSet.size && [...hackerIds].every((id) => suspectSet.has(id));

  room.accusationHistory.push({
    initiatorId: acc.initiatorId,
    suspectIds,
    votes: acc.votes,
    approved: true,
    correct,
    startedAt: acc.startedAt,
    endedAt: deps.now(),
  });
  room.currentAccusation = null;
  room.winner = correct ? 'crew' : 'hackers';
  room.matchClock = stopMatchClock(room.matchClock);
  room.matchLog.push({ at: deps.now(), type: 'accusation_resolved', detail: { correct, winner: room.winner } });
  transition(room, priv, 'FINAL_RESULTS', deps);
}

function handleAccusationVote(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  const acc = room.currentAccusation;
  if (!acc || !acc.suspectIds) return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');

  if (event.type === 'player:submitAccusationVote') {
    if (!acc.eligibleVoterIds.includes(event.playerId)) return rejected(room, priv, 'NOT_ELIGIBLE_VOTER');
    if (hasSubmittedThisPhase(room, event.playerId)) return rejected(room, priv, 'DUPLICATE_ACTION');

    recordSubmission(room, event.playerId);
    acc.votes[event.playerId] = event.vote;
    maybeResolveAccusationVote(room, priv, deps);
    return ok(room, priv);
  }

  if (event.type === 'timer:expired' || event.type === 'host:endVoteEarly') {
    resolveAccusationVote(room, priv, deps);
    return ok(room, priv);
  }

  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

// ---- Match reset (rematch) -------------------------------------------------------------------

function resetMatchScopedState(room: RoomState, priv: RoomPrivateState): void {
  room.cycle = 0;
  room.roundInCycle = 0;
  room.firewallActive = false;
  room.specialGameUsed = false;
  room.winner = null;
  room.adminId = null;
  room.adminQueue = [];
  room.matchClock = initMatchClock();
  room.hackerCount = 0;
  room.currentRound = null;
  room.currentSpecialRound = null;
  room.currentAccusation = null;
  room.accusationCooldownUntil = null;
  room.roundHistory = [];
  room.specialRoundHistory = [];
  room.accusationHistory = [];
  room.matchLog = [];
  for (const player of Object.values(room.players)) {
    player.alive = true;
  }
  for (const p of Object.values(priv.players)) {
    p.role = null;
  }
  priv.hacksRemaining = {};
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

/** Immediate status flip only — synthesized by the Step 4 gateway right after a reconnect succeeds. */
function handlePlayerReconnected(room: RoomState, playerId: string): void {
  const player = room.players[playerId];
  if (player) {
    player.connectionStatus = 'connected';
  }
}

/** Immediate status flip only — NOT grace expiry/abandonment (still `host:graceExpired`, timer-driven). */
function handleHostSocketDisconnected(room: RoomState): void {
  room.host.connectionStatus = 'disconnected';
}

function handleHostSocketReconnected(room: RoomState): void {
  room.host.connectionStatus = 'connected';
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
    // Investigation gameplay begins here — the ONE place the 15-minute match clock starts (GAMEPLAY_RULES_V1.md §2).
    room.matchClock = startMatchClock(room.config.rules.matchClockTotalMs, deps);
    transition(room, priv, 'MINIGAME_SELECT', deps);
    return ok(room, priv);
  }
  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

/** Admin chooses the normal minigame + its participants (GAMEPLAY_RULES_V1.md §4/§5). */
function handleMinigameSelect(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'player:adminSelectMinigame') {
    if (event.playerId !== room.adminId) return rejected(room, priv, 'NOT_ADMIN');

    const module = minigameRegistry[event.minigameId];
    const limit = getParticipantLimit(event.minigameId);
    if (!module || !limit) return rejected(room, priv, 'INVALID_MINIGAME_ID');

    const ids = event.participantIds;
    if (new Set(ids).size !== ids.length) {
      return rejected(room, priv, 'INVALID_PARTICIPANTS', 'Duplicate participant ids');
    }
    if (ids.length < limit.min || ids.length > limit.max) {
      return rejected(room, priv, 'INVALID_PARTICIPANTS', `${event.minigameId} requires between ${limit.min} and ${limit.max} participants`);
    }
    const eligibleIds = new Set(getEligibleMinigamePlayers(room).map((p) => p.playerId));
    for (const id of ids) {
      if (!eligibleIds.has(id)) return rejected(room, priv, 'INVALID_PARTICIPANTS', `Player ${id} is not an eligible participant`);
    }
    if (!room.config.rules.adminMaySelectSelf && ids.includes(event.playerId)) {
      return rejected(room, priv, 'INVALID_PARTICIPANTS', 'Admin may not select themselves as a participant');
    }

    const finalParticipantIds = expandParticipantsForMinigame(room, event.minigameId, ids);
    if (event.minigameId === 'PREDICT_THEM' && finalParticipantIds.length - ids.length < 1) {
      return rejected(room, priv, 'INVALID_PARTICIPANTS', 'Predict Them requires at least one eligible player left over as the audience');
    }

    beginNormalRound(room, event.minigameId, finalParticipantIds, ids, deps);
    transition(room, priv, 'HACKER_CORRUPTION', deps);
    return ok(room, priv);
  }

  if (event.type === 'timer:expired') {
    autoSelectMinigameAndParticipants(room, priv, deps);
    return ok(room, priv);
  }

  return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');
}

/** The Hacker targeted-hack window (GAMEPLAY_RULES_V1.md §7) — the `HACKER_CORRUPTION` phase name is kept for historical/blast-radius reasons; see GAMEPLAY_RULES_V1.md §7 naming note. */
function handleHackWindow(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (!room.currentRound) return rejected(room, priv, 'INVALID_EVENT_FOR_STATE');

  if (event.type === 'player:submitHack') {
    // Defense in depth: autoAdvance() already bypasses this phase entirely the instant it's
    // entered while firewallActive, so a client-originated event can't structurally land here
    // while protected — this check covers it anyway, explicitly, per GAMEPLAY_RULES_V1.md §7.
    if (room.firewallActive) return rejected(room, priv, 'FIREWALL_ACTIVE');
    if (!isHacker(priv, event.playerId)) return rejected(room, priv, 'NOT_HACKER');
    const remaining = priv.hacksRemaining[event.playerId] ?? 0;
    if (remaining <= 0) return rejected(room, priv, 'NO_HACKS_REMAINING');
    if (room.currentRound.hackerActionsUsed[event.playerId]) return rejected(room, priv, 'ALREADY_HACKED_THIS_ROUND');
    if (!room.currentRound.participantIds.includes(event.targetPlayerId)) return rejected(room, priv, 'INVALID_TARGET');
    if (room.currentRound.hackedPlayerIds.includes(event.targetPlayerId)) return rejected(room, priv, 'TARGET_ALREADY_HACKED');

    // Accepted: locks the target for the round, consumes one charge, and uses this Hacker's one
    // action for the round — all three effects only ever happen together, atomically, here.
    room.currentRound.hackedPlayerIds.push(event.targetPlayerId);
    room.currentRound.hackerActionsUsed[event.playerId] = true;
    priv.hacksRemaining[event.playerId] = remaining - 1;
    room.matchLog.push({ at: deps.now(), type: 'hack_accepted', detail: { hackerId: event.playerId, targetPlayerId: event.targetPlayerId } });
    return ok(room, priv);
  }

  if (event.type === 'timer:expired') {
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
    const validation = module.validateAction(round.moduleState, event.playerId, ctx, event.data, event.actionType);
    if (!validation.valid) {
      return rejected(room, priv, 'INVALID_ACTION', validation.reason);
    }
    const previousStep = module.getInternalStep?.(round.moduleState);
    round.moduleState = module.handleAction(round.moduleState, event.playerId, event.data, event.actionType);
    round.lastSeq[event.playerId] = event.seq;
    round.recentActionIds[event.playerId] = [...recentIds, event.actionId].slice(-20);

    if (module.isComplete(round.moduleState)) {
      completeMinigame(room, priv, 'completed', deps);
    } else if (previousStep !== undefined && module.getInternalStep?.(round.moduleState) !== previousStep) {
      transition(room, priv, 'MINIGAME_PLAY', deps);
    }
    return ok(room, priv);
  }

  if (event.type === 'timer:expired') {
    if (module.handleTimeout) {
      const ctx = buildMiniGameContext(room);
      const previousStep = module.getInternalStep?.(room.currentRound.moduleState);
      room.currentRound.moduleState = module.handleTimeout(room.currentRound.moduleState, ctx);
      if (module.isComplete(room.currentRound.moduleState)) {
        completeMinigame(room, priv, 'timeout', deps);
      } else if (previousStep !== undefined && module.getInternalStep?.(room.currentRound.moduleState) !== previousStep) {
        transition(room, priv, 'MINIGAME_PLAY', deps);
      } else {
        completeMinigame(room, priv, 'timeout', deps);
      }
    } else {
      completeMinigame(room, priv, 'timeout', deps);
    }
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
      const ctx = buildSpecialGameContext(room);
      ctx.config = createBombProtocolConfig(room.currentSpecialRound.participantIds, deps.rng);
      room.currentSpecialRound.moduleState = module.start(ctx);
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
    const validation = module.validateAction(round.moduleState, event.playerId, ctx, event.data, event.actionType);
    if (!validation.valid) {
      return rejected(room, priv, 'INVALID_ACTION', validation.reason);
    }
    round.moduleState = module.handleAction(round.moduleState, event.playerId, event.data, event.actionType);
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
    room.currentSpecialRound = null;

    if (last?.success) {
      room.firewallActive = true;
      room.matchLog.push({ at: deps.now(), type: 'firewall_activated', detail: { cycle: room.cycle } });
      room.matchClock = resumeMatchClock(room.matchClock, deps);
    } else if (last) {
      // Failure — subtract exactly the configured penalty (GAMEPLAY_RULES_V1.md §1/§8). If that
      // leaves no time left, the match ends immediately as a Hacker win; the clock never resumes.
      room.matchClock = applyPenalty(room.matchClock, room.config.specialGame.failPenaltyMs);
      room.matchLog.push({ at: deps.now(), type: 'penalty_applied', detail: { ms: room.config.specialGame.failPenaltyMs } });
      if (room.matchClock.remainingMs <= 0) {
        room.winner = 'hackers';
        room.matchClock = stopMatchClock(room.matchClock);
        transition(room, priv, 'FINAL_RESULTS', deps);
        return ok(room, priv);
      }
      room.matchClock = resumeMatchClock(room.matchClock, deps);
    } else {
      // Defensive only — no special-round history somehow. Never leave the clock stuck paused.
      room.matchClock = resumeMatchClock(room.matchClock, deps);
    }

    resolveAfterRoundOrSpecial(room, priv, deps);
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

/**
 * `host:startGame` from REMATCH_LOBBY starts the new match immediately (same one click as LOBBY's
 * own `host:startGame` — see tv-lobby.tsx's "REMATCH_LOBBY behaves exactly like LOBBY from the
 * host's side" comment). Found by PART 5's real-browser validation (final gameplay closure): this
 * previously transitioned to LOBBY instead of ROLE_ASSIGNMENT, silently requiring a SECOND click of
 * an identically-labeled button before anything actually started — never caught by unit tests since
 * none of them drove a real rematch through `host:startGame` (only through the `host:restartMatch`
 * shortcut, which is a different event).
 */
function handleRematchLobby(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  if (event.type === 'host:startGame') {
    resetMatchScopedState(room, priv);
    const count = getPlayerCount(room);
    if (count < room.config.rules.minPlayers || count > room.config.rules.maxPlayers) {
      return rejected(room, priv, 'INVALID_PLAYER_COUNT');
    }
    transition(room, priv, 'ROLE_ASSIGNMENT', deps);
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
  if (event.type === 'player:reconnected') {
    handlePlayerReconnected(nextRoom, event.playerId);
    return ok(nextRoom, nextPriv);
  }
  if (event.type === 'host:disconnected') {
    handleHostSocketDisconnected(nextRoom);
    return ok(nextRoom, nextPriv);
  }
  if (event.type === 'host:reconnected') {
    handleHostSocketReconnected(nextRoom);
    return ok(nextRoom, nextPriv);
  }
  if (event.type === 'host:closeRoom' || event.type === 'host:graceExpired') {
    if (nextRoom.phase.state !== 'ABANDONED') {
      transition(nextRoom, nextPriv, 'ABANDONED', deps);
    }
    return ok(nextRoom, nextPriv);
  }
  if (event.type === 'matchClock:expired') {
    // Cross-cutting, like the disconnect/closeRoom handling above: the match clock can legally
    // expire during any of several different phases (GAMEPLAY_RULES_V1.md §2), so this bypasses
    // the phase-state switch entirely rather than being handled per-state. `clockId` plus
    // `status === 'running'` together are the staleness guard — the same role phaseId plays for
    // phase timers — so a stale/superseded expiry (paused for the special game, or the match
    // already ended some other way) is a harmless no-op, never a double win-condition override.
    if (nextRoom.matchClock.status !== 'running' || nextRoom.matchClock.clockId !== event.clockId || nextRoom.winner !== null) {
      return rejected(nextRoom, nextPriv, 'STALE_MATCH_CLOCK');
    }
    nextRoom.winner = 'hackers';
    nextRoom.matchClock = stopMatchClock(nextRoom.matchClock);
    nextRoom.currentRound = null;
    nextRoom.currentSpecialRound = null;
    if (nextRoom.currentAccusation) {
      nextRoom.matchLog.push({ at: deps.now(), type: 'accusation_abandoned_by_clock', detail: { initiatorId: nextRoom.currentAccusation.initiatorId } });
    }
    nextRoom.currentAccusation = null;
    transition(nextRoom, nextPriv, 'FINAL_RESULTS', deps);
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

  // Centralized accusation-availability policy (GAMEPLAY_RULES_V1.md accusation §4): `pushButton`
  // is legal from several different normal-gameplay states, so it's intercepted here once, rather
  // than duplicating an "is this state allowed" check inside every individual state handler.
  if (event.type === 'player:pushButton') {
    return handlePushButton(nextRoom, nextPriv, event, deps);
  }

  switch (nextRoom.phase.state) {
    case 'LOBBY':
      return handleLobby(nextRoom, nextPriv, event, deps);
    case 'ROLE_REVEAL':
      return handleRoleReveal(nextRoom, nextPriv, event, deps);
    case 'GAME_INTRO':
      return handleGameIntro(nextRoom, nextPriv, event, deps);
    case 'MINIGAME_SELECT':
      return handleMinigameSelect(nextRoom, nextPriv, event, deps);
    case 'HACKER_CORRUPTION':
      return handleHackWindow(nextRoom, nextPriv, event, deps);
    case 'MINIGAME_INSTRUCTIONS':
      return handleMinigameInstructions(nextRoom, nextPriv, event, deps);
    case 'MINIGAME_PLAY':
      return handleMinigamePlay(nextRoom, nextPriv, event, deps);
    case 'RESULTS_REVEAL':
      return handleResultsReveal(nextRoom, nextPriv, event, deps);
    case 'DISCUSSION':
      return handleDiscussion(nextRoom, nextPriv, event, deps);
    case 'ACCUSATION_SELECT':
      return handleAccusationSelect(nextRoom, nextPriv, event, deps);
    case 'ACCUSATION_VOTE':
      return handleAccusationVote(nextRoom, nextPriv, event, deps);
    case 'SPECIAL_GAME_INTRO':
      return handleSpecialGameIntro(nextRoom, nextPriv, event, deps);
    case 'SPECIAL_GAME_PLAY':
      return handleSpecialGamePlay(nextRoom, nextPriv, event, deps);
    case 'SPECIAL_GAME_RESULT':
      return handleSpecialGameResult(nextRoom, nextPriv, event, deps);
    case 'FINAL_RESULTS':
      return handleFinalResults(nextRoom, nextPriv, event, deps);
    case 'REMATCH_LOBBY':
      return handleRematchLobby(nextRoom, nextPriv, event, deps);
    default:
      return rejected(nextRoom, nextPriv, 'INVALID_EVENT_FOR_STATE');
  }
}
