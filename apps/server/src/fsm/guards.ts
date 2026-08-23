import type { EventSender, InboundEvent } from '../shared.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';
import { getEligibleVoters } from '../selectors/players.js';

/**
 * Validation helpers used by handleEvent() before any state mutation. Every event is checked
 * against: current state (by the switch in transitions.ts), sender type + identity, phase id
 * (staleness), and player eligibility — per ARCHITECTURE.md §9.1 and the task's implementation rules.
 */

/** True if `event` claims a phaseId and it does NOT match the room's current phase. */
export function isStalePhase(room: RoomState, event: InboundEvent): boolean {
  if (!('phaseId' in event)) return false;
  return event.phaseId !== room.phase.phaseId;
}

/**
 * These event types are never actually produced by a connected client — they're synthesized by the
 * (Step 4) WebSocket gateway's connection tracker (on socket open/close) or, eventually, a
 * server-side timer scheduler. They carry no meaningful "sender" to authenticate, so they're exempt
 * from the host/player identity check below.
 */
const SYSTEM_EVENT_TYPES = new Set<InboundEvent['type']>([
  'timer:expired',
  'matchClock:expired',
  'player:disconnected',
  'player:reconnected',
  'host:graceExpired',
  'host:disconnected',
  'host:reconnected',
]);

/**
 * Cross-checks the event's declared kind against the already-authenticated sender. A host-shaped
 * event from a player sender (or vice versa) is rejected; a player event whose payload playerId
 * doesn't match the authenticated sender's playerId is also rejected — identity is never trusted
 * from the payload (ARCHITECTURE.md §1.1).
 */
export function checkSenderMatchesEvent(event: InboundEvent, sender: EventSender): 'NOT_HOST' | 'IDENTITY_MISMATCH' | null {
  if (SYSTEM_EVENT_TYPES.has(event.type)) return null;

  const isHostEvent = event.type.startsWith('host:');
  const isPlayerEvent = event.type.startsWith('player:');

  if (isHostEvent && sender.kind !== 'host') return 'NOT_HOST';
  if (isPlayerEvent) {
    if (sender.kind !== 'player') return 'IDENTITY_MISMATCH';
    if ('playerId' in event && event.playerId !== sender.playerId) return 'IDENTITY_MISMATCH';
  }
  return null;
}

export function isHacker(priv: RoomPrivateState, playerId: string): boolean {
  return priv.players[playerId]?.role === 'HACKER';
}

export function getHackerIds(priv: RoomPrivateState): string[] {
  return Object.values(priv.players)
    .filter((p) => p.role === 'HACKER')
    .map((p) => p.playerId);
}

export function isEligibleVoter(room: RoomState, playerId: string): boolean {
  return getEligibleVoters(room).some((p) => p.playerId === playerId);
}

export function hasSubmittedThisPhase(room: RoomState, playerId: string): boolean {
  return room.currentPhaseSubmissions[playerId] === true;
}

export function recordSubmission(room: RoomState, playerId: string): void {
  room.currentPhaseSubmissions[playerId] = true;
}
