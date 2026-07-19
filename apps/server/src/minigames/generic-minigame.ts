import type { JsonValue, MiniGameModule } from '../shared.js';

/**
 * Generic regular-minigame placeholder (ARCHITECTURE.md §11 dev-order step 8): a no-op module that
 * never completes on its own — it always resolves via timeout/forced-end at the phase's configured
 * duration, and always "succeeds". This exists purely to exercise the MINIGAME_SELECT -> ... ->
 * RESULTS_REVEAL plumbing (and the corruption non-leak path) before any real mini-game is designed.
 *
 * Declared as an intersection with Record<string, JsonValue> (rather than a bare interface) so it
 * structurally satisfies `TState extends JsonValue` — a plain interface has no index signature,
 * so TypeScript won't consider it JSON-compatible without one.
 */
export type GenericMinigameState = {
  [key: string]: JsonValue;
  ticks: number;
};

export const GenericMinigameModule: MiniGameModule<GenericMinigameState> = {
  id: 'generic-placeholder',
  version: '0.0.0-placeholder',

  start: () => ({ ticks: 0 }),

  validateAction: () => ({ valid: true }),
  handleAction: (state) => ({ ticks: state.ticks + 1 }),

  isComplete: () => false,
  resolve: (_state, reason) => ({
    success: true,
    scoreDeltas: {},
    resultSummary: { placeholder: true, reason },
  }),

  handleDisconnect: (state) => state,

  getInstructions: () => ({ default: { text: 'Placeholder mini-game: nothing to do yet, just wait.' } }),
  getDurationMs: () => 15_000,

  buildTvView: (state) => ({ placeholder: true, ticks: state.ticks }),
  buildPlayerView: (state) => ({ placeholder: true, ticks: state.ticks }),
  buildSpectatorView: () => ({ placeholder: true, spectating: true }),
};
