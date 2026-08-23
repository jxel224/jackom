import type { MiniGameModule } from '../shared.js';
import { BombProtocolModule } from './bomb-protocol.js';
import { CompleteItModule } from './complete-it.js';
import { RankItModule } from './rank-it.js';
import { PredictThemModule } from './predict-them.js';
import { DrawItModule } from './draw-it.js';
import { DescribeItModule } from './describe-it.js';
import { DefendItModule } from './defend-it.js';

/**
 * minigameId -> module lookup for REGULAR mini-games (the special game is looked up separately).
 * The final approved six: DRAW_IT/RANK_IT/COMPLETE_IT/PREDICT_THEM/DEFEND_IT/DESCRIBE_IT. RATE_IT
 * (the pre-final-closure placeholder RANK_IT replaced) is no longer registered.
 */
export const minigameRegistry: Record<string, MiniGameModule> = {
  [RankItModule.id]: RankItModule,
  [CompleteItModule.id]: CompleteItModule,
  [PredictThemModule.id]: PredictThemModule,
  [DrawItModule.id]: DrawItModule,
  [DescribeItModule.id]: DescribeItModule,
  [DefendItModule.id]: DefendItModule,
};

export function getMinigameModule(minigameId: string): MiniGameModule {
  const module = minigameRegistry[minigameId];
  if (!module) {
    throw new Error(`Unknown minigameId: ${minigameId}`);
  }
  return module;
}

/**
 * Erases BombProtocolModule's concrete TState back to the default `MiniGameModule` (TState =
 * JsonValue) boundary, matching how modules are already handled once they're looked up out of
 * `minigameRegistry` above — CurrentSpecialRoundState.moduleState is JsonValue, and callers should
 * never need to know or cast to the module's internal state shape.
 */
export function getSpecialGameModule(): MiniGameModule {
  return BombProtocolModule;
}
