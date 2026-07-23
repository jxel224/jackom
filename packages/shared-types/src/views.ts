import type { JsonValue } from './json';
import type { PhaseInfo } from './phase';
import type { MatchClock } from './match-clock';
import type { PublicPlayerSummary } from './players';
import type { Role, Winner } from './enums';

/**
 * Explicit client-facing projections (ARCHITECTURE.md §8.6, §13 issue #5). These are the ONLY
 * types that may ever be serialized onto a socket. There is deliberately no function anywhere
 * with the signature "take RoomState, return it minus some fields" — every recipient's shape is
 * hand-declared here, independent of the server-internal RoomState/RoomPrivateState shape.
 */

export interface LastRoundResultSummary {
  minigameId: string;
  success: boolean;
  /** Omitted (undefined) until the configured corruptionRevealPolicy allows exposing it. */
  corrupted?: boolean;
}

export interface TvView {
  roomCode: string;
  phase: PhaseInfo;
  players: PublicPlayerSummary[];
  cycle: number;
  roundInCycle: number;
  firewallActive: boolean;
  matchClock: MatchClock;
  currentMinigame: { minigameId: string; tvView: JsonValue } | null;
  currentSpecialGame: { participantIds: string[]; tvView: JsonValue } | null;
  /** Counts only, never vote content. */
  votingProgress: { votedCount: number; totalEligible: number } | null;
  lastRoundResult: LastRoundResultSummary | null;
  winner: Winner;
}

export interface PlayerView {
  playerId: string;
  self: PublicPlayerSummary;
  others: PublicPlayerSummary[];
  phase: PhaseInfo;
  isParticipantThisRound: boolean;
  /** module.buildPlayerView() if participant, module.buildSpectatorView() otherwise. */
  minigameView: JsonValue | null;
  canVote: boolean;
  canAct: boolean;
  lastRoundResult: LastRoundResultSummary | null;
}

/** Unicast ONLY to the owning player's own socket. Never rebroadcast, never included in TvView/PlayerView. */
export interface PrivatePlayerPayload {
  playerId: string;
  role: Role;
  /** Populated only if role === 'HACKER'. */
  fellowHackerIds: string[];
}
