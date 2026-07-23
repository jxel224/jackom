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
  /** Always false for the special game. Server-computed, module-visible, NOT client-visible until reveal policy allows. */
  corrupted: boolean;
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
  /** Shown instead of default when ctx.corrupted === true, only if the module defines a distinct variant. */
  corrupted?: JsonValue;
}

export type MiniGameResolveReason = 'completed' | 'timeout' | 'forced';

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
  validateAction(state: TState, playerId: string, ctx: MiniGameContext, action: JsonValue): MiniGameActionValidation;
  handleAction(state: TState, playerId: string, action: JsonValue): TState;

  isComplete(state: TState): boolean;
  resolve(state: TState, reason: MiniGameResolveReason): MiniGameResolution;

  handleDisconnect(state: TState, playerId: string): TState;

  getInstructions(ctx: MiniGameContext): MiniGameInstructions;
  getDurationMs(ctx: MiniGameContext): number;

  buildTvView(state: TState): JsonValue;
  buildPlayerView(state: TState, playerId: string, role: Role): JsonValue;
  /** For eliminated / non-participant players — never the same payload as buildPlayerView. */
  buildSpectatorView(state: TState): JsonValue;
}
