import type { JsonValue } from './json';
import type { Role } from './enums';

/**
 * Shared mini-game plugin interface — both regular mini-games and the special seventh game
 * implement this exact shape (ARCHITECTURE.md §8.7, §13 issue #6). A module owns only its own
 * `TState`; it never receives or returns RoomState, and never produces a payload that bypasses
 * the view builders — buildTvView/buildPlayerView/buildSpectatorView return JsonValue, which the
 * FSM embeds into TvView/PlayerView verbatim.
 */
export interface MiniGameContext {
  roomId: string;
  minigameId: string;
  /** Eligible participants for regular games, selected subset for the special game. */
  participantIds: string[];
  /** Module-specific config, opaque to the FSM. */
  config: JsonValue;
}

export interface MiniGameActionValidation {
  valid: boolean;
  /** Human-readable, surfaced via error:actionRejected when invalid. */
  reason?: string;
}

export interface MiniGameResolution {
  success: boolean;
  scoreDeltas: Record<string, number>;
  /** What actually gets persisted into RoundRecord/SpecialRoundRecord — NOT the raw moduleState. */
  resultSummary: JsonValue;
}

export interface MiniGameInstructions {
  default: JsonValue;
}

export type MiniGameResolveReason = 'completed' | 'timeout' | 'forced';

/** Projection-only context supplied by the safe view builders. */
export interface MiniGameViewContext {
  /** True only after the round has entered its public result phase. */
  revealResults: boolean;
}

export interface MiniGameModule<TState extends JsonValue = JsonValue> {
  id: string;
  /** Persisted into RoundRecord.minigameVersion for later analytics/replay. */
  version: string;

  start(ctx: MiniGameContext): TState;

  /**
   * Called BEFORE handleAction on every incoming action — rejects illegal actions (wrong player,
   * malformed payload, not a participant) without ever mutating state. The FSM enforces that this
   * is always called first; a module cannot skip validation by only implementing handleAction.
   */
  validateAction(state: TState, playerId: string, ctx: MiniGameContext, action: JsonValue, actionType?: string): MiniGameActionValidation;
  handleAction(state: TState, playerId: string, action: JsonValue, actionType?: string): TState;

  isComplete(state: TState): boolean;
  resolve(state: TState, reason: MiniGameResolveReason): MiniGameResolution;

  /** Optional support for bounded internal steps while the global FSM remains in MINIGAME_PLAY. */
  getInternalStep?(state: TState): string;
  /** Called on the current internal step's server-owned timer expiry. */
  handleTimeout?(state: TState, ctx: MiniGameContext): TState;

  handleDisconnect(state: TState, playerId: string): TState;

  getInstructions(ctx: MiniGameContext): MiniGameInstructions;
  getDurationMs(ctx: MiniGameContext, state?: TState): number;

  buildTvView(state: TState, view: MiniGameViewContext): JsonValue;
  buildPlayerView(state: TState, playerId: string, role: Role, view: MiniGameViewContext): JsonValue;
  /** For eliminated / non-participant players — never the same payload as buildPlayerView. */
  buildSpectatorView(state: TState, view: MiniGameViewContext): JsonValue;
}
