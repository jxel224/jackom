import type { Deps } from '../types/deps.js';
import { randomChoice } from '../fsm/random.js';

export const DEFEND_IT_FOLLOW_UP_STRATEGY = 'RANDOM_ELIGIBLE_PLAYER' as const;

/** Isolated temporary strategy so Admin/fairness selection can replace it without changing the module. */
export function selectRandomFollowUpAskers(
  speakerOrder: string[],
  rng: Deps['rng'],
): Record<string, string> {
  return Object.fromEntries(
    speakerOrder.map((speakerId) => [speakerId, randomChoice(speakerOrder.filter((id) => id !== speakerId), rng)]),
  );
}
