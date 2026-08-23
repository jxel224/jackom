import type { JsonValue } from './json';
import type { PhaseInfo } from './phase';
import type { MatchClock } from './match-clock';
import type { PublicPlayerSummary } from './players';
import type { Role, Winner } from './enums';

/** Public only once the match has ended (`winner !== null`) — never before. See `LastRoundResultSummary` for the same secrecy guarantee applied to the (still-secret-forever) per-round hack target. */
export interface FinalRoleReveal {
  playerId: string;
  role: Role;
}

/**
 * Explicit client-facing projections (ARCHITECTURE.md §8.6, §13 issue #5). These are the ONLY
 * types that may ever be serialized onto a socket. There is deliberately no function anywhere
 * with the signature "take RoomState, return it minus some fields" — every recipient's shape is
 * hand-declared here, independent of the server-internal RoomState/RoomPrivateState shape.
 */

export interface LastRoundResultSummary {
  minigameId: string;
  success: boolean;
  /**
   * Deliberately has NO field carrying which player(s) were hacked (Core Logic Phase 1.1 —
   * GAMEPLAY_RULES_V1.md's hack system was amended: hack targets are completely secret in v1, full
   * stop, not merely reveal-policy-gated). `RoomState.roundHistory[n].hackedPlayerIds` still exists
   * server-side for debugging/analytics/match-history — this type is what proves it structurally
   * cannot leak from there into any client payload, the same guarantee `TvView`'s lack of a `role`
   * field already gives roles.
   */
}

/** Sent only inside a Hacker's own PlayerView — see GAMEPLAY_RULES_V1.md §11. */
export interface HackerPlayerInfo {
  hacksRemaining: number;
  /** True only while the room is in the hack window, this player hasn't acted yet this round, and Firewall isn't blocking it. */
  canHackNow: boolean;
  /** This round's participant ids — the only legal hack targets. Empty unless canHackNow. */
  eligibleTargetIds: string[];
}

/** Sent only inside the current Admin's own PlayerView, only during MINIGAME_SELECT — see GAMEPLAY_RULES_V1.md §11. */
export interface AdminSelectionInfo {
  availableMinigameIds: string[];
  participantLimits: Record<string, { min: number; max: number }>;
  eligiblePlayerIds: string[];
}

/**
 * Public accusation state — Core Logic Phase 2A. Present on both TvView and PlayerView while an
 * accusation is active (ACCUSATION_SELECT/ACCUSATION_VOTE); never reveals individual votes or
 * anyone's role, including the initiator's.
 */
export interface AccusationPublicView {
  initiatorId: string;
  requiredSuspectCount: number;
  /** Null during ACCUSATION_SELECT; the locked suspect set once voting begins. */
  suspectIds: string[] | null;
  /** Null during ACCUSATION_SELECT. Counts only, never individual choices. */
  votedCount: number | null;
  totalEligible: number | null;
}

/** Sent only inside the requesting player's own PlayerView, only while an accusation is active. */
export interface PlayerAccusationInfo extends AccusationPublicView {
  isInitiator: boolean;
  /** Only populated for the initiator, only during ACCUSATION_SELECT — who may legally be nominated. */
  eligibleSuspectIds: string[] | null;
  /** Only meaningful during ACCUSATION_VOTE. */
  hasVoted: boolean;
}

export interface TvView {
  roomCode: string;
  phase: PhaseInfo;
  players: PublicPlayerSummary[];
  cycle: number;
  roundInCycle: number;
  /** Current round's Admin, or null outside an active round-selection/round. */
  adminId: string | null;
  firewallActive: boolean;
  matchClock: MatchClock;
  currentMinigame: { minigameId: string; tvView: JsonValue } | null;
  currentSpecialGame: { participantIds: string[]; tvView: JsonValue } | null;
  /** Public Hacker count for the match — never identities (Core Logic Phase 2A). */
  hackerCount: number;
  /** Populated only while an accusation is active (ACCUSATION_SELECT/ACCUSATION_VOTE). */
  accusation: AccusationPublicView | null;
  /** Epoch ms after which another accusation may be initiated, or null if not on cooldown. */
  accusationCooldownUntil: number | null;
  lastRoundResult: LastRoundResultSummary | null;
  winner: Winner;
  /** Every player's true role — null until the match has ended (`winner !== null`), never before. */
  finalReveal: FinalRoleReveal[] | null;
}

export interface PlayerView {
  playerId: string;
  self: PublicPlayerSummary;
  others: PublicPlayerSummary[];
  phase: PhaseInfo;
  /** Current round's Admin, or null outside an active round-selection/round. Same value TvView already shows publicly — needed here too so a non-Admin player can identify who currently holds it. */
  adminId: string | null;
  isParticipantThisRound: boolean;
  /** True only for the player currently holding Admin — never reveals anyone else's role/eligibility beyond what TvView already shows. */
  isAdmin: boolean;
  /** Populated only when isAdmin && phase is MINIGAME_SELECT. */
  adminSelection: AdminSelectionInfo | null;
  /** Populated only for this player's own socket when their role is HACKER. Always null for Crew. */
  hackerInfo: HackerPlayerInfo | null;
  matchClock: MatchClock;
  /** module.buildPlayerView() if participant, module.buildSpectatorView() otherwise. */
  minigameView: JsonValue | null;
  canAct: boolean;
  /** Public Hacker count for the match — never identities (Core Logic Phase 2A). */
  hackerCount: number;
  /** True only in an allowed investigation state, with no accusation already active and no cooldown UI-advisory only — the server re-validates authoritatively regardless. */
  canPushButton: boolean;
  /** Populated only while an accusation is active (ACCUSATION_SELECT/ACCUSATION_VOTE). */
  accusation: PlayerAccusationInfo | null;
  /** Epoch ms after which another accusation may be initiated, or null if not on cooldown. */
  accusationCooldownUntil: number | null;
  lastRoundResult: LastRoundResultSummary | null;
  winner: Winner;
  /** Every player's true role — null until the match has ended (`winner !== null`), never before. */
  finalReveal: FinalRoleReveal[] | null;
}

/** Unicast ONLY to the owning player's own socket. Never rebroadcast, never included in TvView/PlayerView. */
export interface PrivatePlayerPayload {
  playerId: string;
  role: Role;
  /** Populated only if role === 'HACKER'. */
  fellowHackerIds: string[];
}
