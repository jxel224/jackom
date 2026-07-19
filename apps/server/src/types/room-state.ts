import type {
  CurrentRoundState,
  CurrentSpecialRoundState,
  CurrentVoteState,
  MatchClock,
  MatchLogEntry,
  PhaseInfo,
  PlayerPublic,
  RoomConfig,
  RoundRecord,
  SpecialRoundRecord,
  VoteRecord,
  Winner,
} from '../shared.js';
import type { HostSession, PlayerPrivate } from './sessions.js';

/**
 * Server-internal persistence document. Written to Redis (later) for durability, but no code path
 * serializes it directly onto the wire — every outbound payload is one of the explicit projections
 * in views/ (TvView, PlayerView, PrivatePlayerPayload), built fresh at send time.
 * See ARCHITECTURE.md §7, §8.6.
 */
export interface RoomState {
  roomId: string;
  roomCode: string;
  host: HostSession;
  config: RoomConfig;

  /** NEVER call `.length`/array methods on this directly — use the selectors in selectors/players.ts. */
  players: Record<string, PlayerPublic>;
  phase: PhaseInfo;

  cycle: number;
  roundInCycle: number;
  firewallActive: boolean;
  specialGameUsed: boolean;
  winner: Winner;

  matchClock: MatchClock;

  currentRound: CurrentRoundState | null;
  currentSpecialRound: CurrentSpecialRoundState | null;
  currentVote: CurrentVoteState | null;

  /**
   * playerId -> submitted for THIS phaseId; reset on every transition(). Unifies single-submission
   * tracking (role-reveal acks, corruption choices, votes, rematch requests) into one mechanism.
   */
  currentPhaseSubmissions: Record<string, boolean>;

  roundHistory: RoundRecord[];
  specialRoundHistory: SpecialRoundRecord[];
  voteHistory: VoteRecord[];
  matchLog: MatchLogEntry[];

  /** Incremented every transition(); a sanity check on rehydration, NOT a distributed-lock mechanism. */
  stateVersion: number;
  createdAt: number;
  updatedAt: number;
}

/** Server-only. Never serialized into any client-facing payload, never logged wholesale. */
export interface RoomPrivateState {
  roomId: string;
  players: Record<string, PlayerPrivate>;
  /** hackerId -> choice, cleared every round. */
  currentCorruptionChoices: Record<string, boolean>;
}
