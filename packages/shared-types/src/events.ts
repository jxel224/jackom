import type { JsonValue } from './json';
import type { AccusationVoteChoice } from './enums';

/**
 * Events accepted by the FSM (ARCHITECTURE.md §6, §9). In production these are constructed by the
 * (not-yet-built) WebSocket gateway AFTER authenticating the sender — `playerId` here is always
 * read from the authenticated socket, never trusted from a raw client payload. The FSM in this
 * package assumes that binding has already happened; it does not perform network authentication.
 *
 * `timer:expired` and `player:disconnected` are internal events fed into the same handler by the
 * (not-yet-built) timer scheduler / connection tracker — they are not literal wire messages from a
 * client, but they flow through the identical `handleEvent()` entry point.
 */

export type HostPhaseAction =
  | 'host:skipIntro'
  | 'host:skipInstructions'
  | 'host:skipRevealTimer'
  | 'host:skipResultsReveal'
  | 'host:skipSpecialIntro'
  | 'host:forceEndMinigame'
  | 'host:forceEndSpecialGame'
  | 'host:endDiscussionEarly'
  | 'host:endVoteEarly'
  | 'host:advance';

export interface HostStartGameEvent {
  type: 'host:startGame';
  phaseId: string;
}

export interface HostPhaseActionEvent {
  type: HostPhaseAction;
  phaseId: string;
}

export interface HostRestartMatchEvent {
  type: 'host:restartMatch';
}

export interface HostCloseRoomEvent {
  type: 'host:closeRoom';
}

export interface HostDisconnectedEvent {
  type: 'host:graceExpired';
}

export interface PlayerAcknowledgeRevealEvent {
  type: 'player:acknowledgeReveal';
  phaseId: string;
  playerId: string;
}

/** Submitted only by the current Admin, during MINIGAME_SELECT — GAMEPLAY_RULES_V1.md §4/§5. */
export interface PlayerAdminSelectMinigameEvent {
  type: 'player:adminSelectMinigame';
  phaseId: string;
  playerId: string;
  minigameId: string;
  participantIds: string[];
}

/** Submitted only by a Hacker, during the hack window — GAMEPLAY_RULES_V1.md §7. Replaces the old round-wide `player:submitCorruptionChoice`. */
export interface PlayerSubmitHackEvent {
  type: 'player:submitHack';
  phaseId: string;
  playerId: string;
  targetPlayerId: string;
}

export interface PlayerSubmitActionEvent {
  type: 'player:submitAction';
  phaseId: string;
  playerId: string;
  seq: number;
  actionId: string;
  actionType: string;
  data: JsonValue;
}

/**
 * Any eligible player may push the button, from an allowed investigation state (GAMEPLAY_RULES_V1.md
 * accusation system section) — Crew and Hackers alike. The server never exposes the pusher's role.
 */
export interface PlayerPushButtonEvent {
  type: 'player:pushButton';
  phaseId: string;
  playerId: string;
}

/** Submitted only by the accusation's initiator, during ACCUSATION_SELECT. */
export interface PlayerSubmitAccusationEvent {
  type: 'player:submitAccusation';
  phaseId: string;
  playerId: string;
  suspectIds: string[];
}

/** Submitted by any eligible voter, during ACCUSATION_VOTE. One vote per player, locked on submission. */
export interface PlayerSubmitAccusationVoteEvent {
  type: 'player:submitAccusationVote';
  phaseId: string;
  playerId: string;
  vote: AccusationVoteChoice;
}

export interface PlayerRequestRematchEvent {
  type: 'player:requestRematch';
  phaseId: string;
  playerId: string;
}

export interface PlayerDisconnectedEvent {
  type: 'player:disconnected';
  playerId: string;
}

/**
 * Synthesized by the gateway immediately after a player's reconnect succeeds — flips
 * `connectionStatus` back to 'connected'. Added in Step 4 so the gateway never has to mutate
 * `RoomState` directly; connection-status bookkeeping stays inside the FSM, symmetric with
 * `player:disconnected`.
 */
export interface PlayerReconnectedEvent {
  type: 'player:reconnected';
  playerId: string;
}

/** Synthesized by the gateway on host socket close. Immediate status flip only — NOT grace expiry/abandonment (that remains `host:graceExpired`, still timer-driven and out of scope until server timers exist). */
export interface HostSocketDisconnectedEvent {
  type: 'host:disconnected';
}

/** Synthesized by the gateway immediately after a host's (re)connect succeeds. */
export interface HostSocketReconnectedEvent {
  type: 'host:reconnected';
}

export interface TimerExpiredEvent {
  type: 'timer:expired';
  phaseId: string;
}

/**
 * Synthesized internally by MatchClockService when the match clock's deadline is reached
 * (GAMEPLAY_RULES_V1.md §6) — never sent by a client. `clockId` guards against a stale/superseded
 * expiry (e.g. the clock was paused for the special game, or already ended the match) the same way
 * `TimerExpiredEvent.phaseId` guards phase timers.
 */
export interface MatchClockExpiredEvent {
  type: 'matchClock:expired';
  clockId: string;
}

/**
 * Represents identity already authenticated at the WebSocket connection level (ARCHITECTURE.md
 * §1.1) — the (not-yet-built) gateway constructs this from the socket's bound session, never from
 * anything inside the event payload. `handleEvent` cross-checks the event against this and rejects
 * on mismatch (host event from a player sender, or a player event whose payload playerId doesn't
 * match the authenticated sender), so identity spoofing via payload content is structurally impossible.
 */
export type EventSender = { kind: 'host' } | { kind: 'player'; playerId: string };

export type InboundEvent =
  | HostStartGameEvent
  | HostPhaseActionEvent
  | HostRestartMatchEvent
  | HostCloseRoomEvent
  | HostDisconnectedEvent
  | PlayerAcknowledgeRevealEvent
  | PlayerAdminSelectMinigameEvent
  | PlayerSubmitHackEvent
  | PlayerPushButtonEvent
  | PlayerSubmitAccusationEvent
  | PlayerSubmitAccusationVoteEvent
  | PlayerSubmitActionEvent
  | PlayerRequestRematchEvent
  | PlayerDisconnectedEvent
  | PlayerReconnectedEvent
  | HostSocketDisconnectedEvent
  | HostSocketReconnectedEvent
  | TimerExpiredEvent
  | MatchClockExpiredEvent;

export type RejectionCode =
  | 'STALE_PHASE'
  | 'DUPLICATE_ACTION'
  | 'OUT_OF_ORDER'
  | 'NOT_PARTICIPANT'
  | 'NOT_HACKER'
  | 'NOT_ELIGIBLE_VOTER'
  | 'NOT_HOST'
  | 'IDENTITY_MISMATCH'
  | 'INVALID_ACTION'
  | 'INVALID_EVENT_FOR_STATE'
  | 'MATCH_IN_PROGRESS'
  | 'INVALID_PLAYER_COUNT'
  | 'WRONG_INSTANCE'
  | 'NOT_ADMIN'
  | 'INVALID_MINIGAME_ID'
  | 'INVALID_PARTICIPANTS'
  | 'NO_HACKS_REMAINING'
  | 'ALREADY_HACKED_THIS_ROUND'
  | 'INVALID_TARGET'
  | 'TARGET_ALREADY_HACKED'
  | 'FIREWALL_ACTIVE'
  | 'STALE_MATCH_CLOCK'
  | 'ACCUSATION_ON_COOLDOWN'
  | 'NOT_INITIATOR'
  | 'INVALID_SUSPECTS';

export interface ActionRejectedMessage {
  code: RejectionCode;
  message?: string;
  phaseId?: string;
}
