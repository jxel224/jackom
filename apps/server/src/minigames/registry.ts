import type { MiniGameModule } from '../shared.js';
import { GenericMinigameModule } from './generic-minigame.js';
import { GenericSpecialGameModule } from './generic-special-game.js';

/** minigameId -> module lookup for REGULAR mini-games (the special game is looked up separately). */
export const minigameRegistry: Record<string, MiniGameModule> = {
  [GenericMinigameModule.id]: GenericMinigameModule,
};

export function getMinigameModule(minigameId: string): MiniGameModule {
  const module = minigameRegistry[minigameId];
  if (!module) {
    throw new Error(`Unknown minigameId: ${minigameId}`);
  }
  return module;
}

/**
 * Erases GenericSpecialGameModule's concrete TState back to the default `MiniGameModule` (TState =
 * JsonValue) boundary, matching how modules are already handled once they're looked up out of
 * `minigameRegistry` above — CurrentSpecialRoundState.moduleState is JsonValue, and callers should
 * never need to know or cast to the module's internal state shape.
 */
export function getSpecialGameModule(): MiniGameModule {
  return GenericSpecialGameModule;
}
