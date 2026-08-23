import type { Deps } from '../../src/types/deps.js';
import type { InboundEvent, RoomConfig } from '../../src/shared.js';
import type { RoomState, RoomPrivateState } from '../../src/types/room-state.js';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { createRoom, joinPlayer } from '../../src/fsm/room-lifecycle.js';
import { handleEvent } from '../../src/fsm/transitions.js';
import type { HandleEventResult } from '../../src/fsm/result.js';

export interface SetupResult {
  room: RoomState;
  priv: RoomPrivateState;
  hostSessionToken: string;
  playerIds: string[];
}

export function setupRoom(playerCount: number, deps: Deps, overrides: Partial<RoomConfig> = {}): SetupResult {
  const config = createDefaultConfig(overrides);
  const created = createRoom(config, deps);
  let room = created.room;
  let priv = created.priv;

  const playerIds: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    const res = joinPlayer(room, priv, { name: `Player${i}`, avatarId: `avatar-${i}` }, deps);
    if (!res.playerId || !res.sessionToken) {
      throw new Error(`join failed in test setup: ${JSON.stringify(res.rejected)}`);
    }
    room = res.room;
    priv = res.priv;
    playerIds.push(res.playerId);
  }

  return { room, priv, hostSessionToken: created.hostSessionToken, playerIds };
}

export function hostEvent(room: RoomState, type: InboundEvent['type']): InboundEvent {
  return { type, phaseId: room.phase.phaseId } as InboundEvent;
}

export function sendHost(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  return handleEvent(room, priv, event, { kind: 'host' }, deps);
}

export function sendPlayer(room: RoomState, priv: RoomPrivateState, event: InboundEvent, playerId: string, deps: Deps): HandleEventResult {
  return handleEvent(room, priv, event, { kind: 'player', playerId }, deps);
}

export function sendSystem(room: RoomState, priv: RoomPrivateState, event: InboundEvent, deps: Deps): HandleEventResult {
  // timer:expired / player:disconnected carry no host/player identity to check against.
  return handleEvent(room, priv, event, { kind: 'host' }, deps);
}

export function startGame(room: RoomState, priv: RoomPrivateState, deps: Deps): HandleEventResult {
  return sendHost(room, priv, { type: 'host:startGame', phaseId: room.phase.phaseId }, deps);
}

/** Acknowledges ROLE_REVEAL for every given player, in order, returning the final result. */
export function ackAllReveals(room: RoomState, priv: RoomPrivateState, playerIds: string[], deps: Deps): HandleEventResult {
  let r = room;
  let p = priv;
  let last: HandleEventResult = { room: r, priv: p };
  for (const id of playerIds) {
    last = sendPlayer(r, p, { type: 'player:acknowledgeReveal', phaseId: r.phase.phaseId, playerId: id }, id, deps);
    r = last.room;
    p = last.priv;
  }
  return last;
}

export function expireTimer(room: RoomState, priv: RoomPrivateState, deps: Deps): HandleEventResult {
  return sendSystem(room, priv, { type: 'timer:expired', phaseId: room.phase.phaseId }, deps);
}

/** Submits the current Admin's minigame + participant selection (GAMEPLAY_RULES_V1.md §4/§5). */
export function adminSelectMinigame(
  room: RoomState,
  priv: RoomPrivateState,
  minigameId: string,
  participantIds: string[],
  deps: Deps,
): HandleEventResult {
  if (!room.adminId) throw new Error('adminSelectMinigame: room has no current Admin');
  return sendPlayer(
    room,
    priv,
    { type: 'player:adminSelectMinigame', phaseId: room.phase.phaseId, playerId: room.adminId, minigameId, participantIds },
    room.adminId,
    deps,
  );
}

/** Submits a targeted hack attempt (GAMEPLAY_RULES_V1.md §7). */
export function submitHack(room: RoomState, priv: RoomPrivateState, hackerId: string, targetPlayerId: string, deps: Deps): HandleEventResult {
  return sendPlayer(room, priv, { type: 'player:submitHack', phaseId: room.phase.phaseId, playerId: hackerId, targetPlayerId }, hackerId, deps);
}

export function hackerIdsOf(priv: RoomPrivateState): string[] {
  return Object.values(priv.players)
    .filter((p) => p.role === 'HACKER')
    .map((p) => p.playerId);
}

export function crewIdsOf(priv: RoomPrivateState): string[] {
  return Object.values(priv.players)
    .filter((p) => p.role === 'CREW')
    .map((p) => p.playerId);
}

/**
 * Drives a freshly-joined room all the way from LOBBY to the first HACKER_CORRUPTION (hack window)
 * phase, via the Admin-selection TIMEOUT fallback (GAMEPLAY_RULES_V1.md §4/§5) — the caller is
 * expected to have configured a forcing `minigameSelectionRuleId` (e.g. `'rank-it-only'`) if it
 * cares which minigame ends up selected, exactly as before this helper existed.
 *
 * Because the timeout fallback picks a RANDOM eligible subset as participants, this is only safe
 * to use for tests that don't care WHICH specific players end up in the round — anything that
 * needs a specific Hacker (or two) guaranteed to be a participant must use
 * `driveToAdminSelection` + an explicit `adminSelectMinigame` call instead (Core Logic Phase 1.1 —
 * see CORE_LOGIC_PHASE1_1_HARDENING_REPORT.md §3 for why relying on random luck here was a
 * false-positive-test risk).
 */
export function driveToFirstCorruptionPhase(setup: SetupResult, deps: Deps): HandleEventResult {
  const { room, priv, playerIds } = setup;
  const afterStart = startGame(room, priv, deps);
  const afterAcks = ackAllReveals(afterStart.room, afterStart.priv, playerIds, deps);
  const afterIntro = expireTimer(afterAcks.room, afterAcks.priv, deps); // GAME_INTRO -> MINIGAME_SELECT
  return expireTimer(afterIntro.room, afterIntro.priv, deps); // Admin-selection timeout -> HACKER_CORRUPTION
}

/**
 * Drives a freshly-joined room from LOBBY to the first (real, Admin-waiting) MINIGAME_SELECT
 * phase — roles are already assigned by this point (at ROLE_ASSIGNMENT, well before this), so
 * `hackerIdsOf(atSelect.priv)`/`crewIdsOf(atSelect.priv)` are final for the match. Pair with an
 * explicit `adminSelectMinigame(atSelect.room, atSelect.priv, minigameId, participantIds, deps)`
 * call, constructing `participantIds` FROM those known role ids, to deterministically guarantee a
 * specific Hacker/Crew composition ends up in the round — never rely on the random timeout
 * fallback when a test's assertion depends on who specifically is participating.
 */
export function driveToAdminSelection(setup: SetupResult, deps: Deps): HandleEventResult {
  const { room, priv, playerIds } = setup;
  const afterStart = startGame(room, priv, deps);
  const afterAcks = ackAllReveals(afterStart.room, afterStart.priv, playerIds, deps);
  return expireTimer(afterAcks.room, afterAcks.priv, deps); // GAME_INTRO -> MINIGAME_SELECT
}

/**
 * Drives a freshly-joined room from LOBBY through one full, deterministic RANK_IT round (real
 * Admin selection, not the random timeout fallback) all the way to DISCUSSION — Core Logic Phase
 * 2A's accusation system can be pushed from either DISCUSSION or MINIGAME_SELECT; this reaches the
 * former deterministically, `driveToAdminSelection` reaches the latter.
 */
export function driveToDiscussion(setup: SetupResult, deps: Deps): HandleEventResult {
  const atSelect = driveToAdminSelection(setup, deps);
  const adminId = atSelect.room.adminId!;
  const others = Object.keys(atSelect.room.players).filter((id) => id !== adminId);
  let last = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', others.slice(0, 2), deps);

  for (let i = 0; i < 10 && last.room.phase.state !== 'DISCUSSION'; i++) {
    last = expireTimer(last.room, last.priv, deps);
  }
  if (last.room.phase.state !== 'DISCUSSION') {
    throw new Error(`driveToDiscussion: gave up without reaching DISCUSSION (stuck at ${last.room.phase.state})`);
  }
  return last;
}

// ---- Accusation ("push the button") — Core Logic Phase 2A --------------------------------------

export function pushButton(room: RoomState, priv: RoomPrivateState, playerId: string, deps: Deps): HandleEventResult {
  return sendPlayer(room, priv, { type: 'player:pushButton', phaseId: room.phase.phaseId, playerId }, playerId, deps);
}

export function submitAccusation(room: RoomState, priv: RoomPrivateState, initiatorId: string, suspectIds: string[], deps: Deps): HandleEventResult {
  return sendPlayer(room, priv, { type: 'player:submitAccusation', phaseId: room.phase.phaseId, playerId: initiatorId, suspectIds }, initiatorId, deps);
}

export function submitAccusationVote(
  room: RoomState,
  priv: RoomPrivateState,
  voterId: string,
  vote: 'APPROVE' | 'REJECT',
  deps: Deps,
): HandleEventResult {
  return sendPlayer(room, priv, { type: 'player:submitAccusationVote', phaseId: room.phase.phaseId, playerId: voterId, vote }, voterId, deps);
}

/** Every player currently in the room voting the SAME way, in playerId order — a convenience for tests that don't care about vote-order edge cases. */
export function castAccusationVotes(
  room: RoomState,
  priv: RoomPrivateState,
  voterIds: string[],
  vote: 'APPROVE' | 'REJECT',
  deps: Deps,
): HandleEventResult {
  let r = room;
  let p = priv;
  let last: HandleEventResult = { room: r, priv: p };
  for (const id of voterIds) {
    last = submitAccusationVote(r, p, id, vote, deps);
    r = last.room;
    p = last.priv;
  }
  return last;
}
