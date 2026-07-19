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

/** Drives a freshly-joined room all the way from LOBBY to the first HACKER_CORRUPTION phase. */
export function driveToFirstCorruptionPhase(setup: SetupResult, deps: Deps): HandleEventResult {
  const { room, priv, playerIds } = setup;
  const afterStart = startGame(room, priv, deps);
  const afterAcks = ackAllReveals(afterStart.room, afterStart.priv, playerIds, deps);
  // GAME_INTRO -> MINIGAME_SELECT -> HACKER_CORRUPTION (both auto/instant once the intro timer fires)
  return expireTimer(afterAcks.room, afterAcks.priv, deps);
}

/**
 * Drives a freshly-joined room from LOBBY all the way to VOTING, by repeatedly letting every
 * phase's timer expire. Requires `specialGameScheduleRuleId: 'placeholder-never'` in the room's
 * config so DISCUSSION never diverts into the special-game branch (tested separately).
 */
export function driveToVoting(setup: SetupResult, deps: Deps): HandleEventResult {
  const started = startGame(setup.room, setup.priv, deps);
  let last = ackAllReveals(started.room, started.priv, setup.playerIds, deps);

  for (let i = 0; i < 60 && last.room.phase.state !== 'VOTING'; i++) {
    last = expireTimer(last.room, last.priv, deps);
  }
  if (last.room.phase.state !== 'VOTING') {
    throw new Error(`driveToVoting: gave up without reaching VOTING (stuck at ${last.room.phase.state})`);
  }
  return last;
}
