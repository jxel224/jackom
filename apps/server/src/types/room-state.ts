import type {
  AccusationRecord,
  CurrentAccusationState,
  CurrentRoundState,
  CurrentSpecialRoundState,
  MatchClock,
  MatchLogEntry,
  PhaseInfo,
  PlayerPublic,
  RoomConfig,
  RoundRecord,
  SpecialRoundRecord,
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

  /** Current round's Admin — GAMEPLAY_RULES_V1.md §4. Null before investigation gameplay starts. */
  adminId: string | null;
  /** Shuffled queue of eligible playerIds who haven't held Admin yet this rotation cycle. Reshuffled from the eligible pool whenever it empties. */
  adminQueue: string[];

  matchClock: MatchClock;

  /** Public count of Hackers this match — set once at role assignment. Never the identities (Core Logic Phase 2A §2). */
  hackerCount: number;

  currentRound: CurrentRoundState | null;
  currentSpecialRound: CurrentSpecialRoundState | null;
  /** The Crew's active final accusation, if any — Core Logic Phase 2A. */
  currentAccusation: CurrentAccusationState | null;
  /** Epoch ms after which another accusation may be initiated, or null if not on cooldown. */
  accusationCooldownUntil: number | null;

  /**
   * playerId -> submitted for THIS phaseId; reset on every transition(). Unifies single-submission
   * tracking (role-reveal acks, votes, rematch requests) into one mechanism. Hack submissions are
   * tracked separately via `CurrentRoundState.hackerActionsUsed`, not this map.
   */
  currentPhaseSubmissions: Record<string, boolean>;

  roundHistory: RoundRecord[];
  specialRoundHistory: SpecialRoundRecord[];
  accusationHistory: AccusationRecord[];
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
  /** hackerId -> hacks left this match (starts at 2, GAMEPLAY_RULES_V1.md §7). 0 for Crew players. Reset only on rematch. */
  hacksRemaining: Record<string, number>;
}
