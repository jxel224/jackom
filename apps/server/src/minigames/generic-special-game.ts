import type { JsonValue, MiniGameModule } from '../shared.js';

/**
 * Generic special-game placeholder (ARCHITECTURE.md §8.7 example, §11 dev-order step 10).
 * Matches the exact interface shape the real special games (Blind Escape / Bomb Protocol /
 * The Moving Package) will eventually implement. Never completes and always resolves as a
 * failure — good enough to exercise SPECIAL_GAME_INTRO -> ... -> SPECIAL_GAME_RESULT plumbing,
 * including the firewall/penalty consequence, without designing real mechanics yet.
 */
export type GenericSpecialGameState = {
  [key: string]: JsonValue;
  participantIds: string[];
};

export const GenericSpecialGameModule: MiniGameModule<GenericSpecialGameState> = {
  id: 'generic-special-game',
  version: '0.0.0-placeholder',

  start: (ctx) => ({ participantIds: ctx.participantIds }),

  validateAction: () => ({ valid: false, reason: 'not implemented' }),
  handleAction: (state) => state,

  isComplete: () => false,
  resolve: () => ({ success: false, scoreDeltas: {}, resultSummary: { placeholder: true } }),

  handleDisconnect: (state) => state,

  getInstructions: () => ({ default: { text: 'Placeholder special game.' } }),
  getDurationMs: () => 120_000,

  buildTvView: () => ({ placeholder: true }),
  buildPlayerView: () => ({ placeholder: true }),
  buildSpectatorView: () => ({ placeholder: true, spectating: true }),
};
