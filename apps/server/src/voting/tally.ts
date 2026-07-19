import type { TieBreakRule } from '../shared.js';
import type { Deps } from '../types/deps.js';
import { randomChoice } from '../fsm/random.js';

export interface TallyResult {
  eliminatedPlayerId: string | null;
  tie: boolean;
  tiedTargetIds: string[];
  /** True only when tieBreakRule is 'revote', this is the first tie, and the caller should re-enter VOTING. */
  shouldRevote: boolean;
}

const SKIP = 'skip';

/**
 * Counts non-'skip' votes and applies the configured tie-break rule.
 *
 * `isRevoteAttempt` indicates this tally is already a re-vote (restricted to previously-tied
 * targets) — under `tieBreakRule: 'revote'`, a second consecutive tie falls back to no elimination
 * rather than looping forever (ARCHITECTURE.md §9.1: "bounded — max 1 revote").
 */
export function tally(
  votes: Record<string, string>,
  tieBreakRule: TieBreakRule,
  rng: Deps['rng'],
  isRevoteAttempt: boolean,
): TallyResult {
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) {
    if (target === SKIP) continue;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return { eliminatedPlayerId: null, tie: false, tiedTargetIds: [], shouldRevote: false };
  }

  const max = Math.max(...counts.values());
  const topTargets = [...counts.entries()].filter(([, count]) => count === max).map(([id]) => id);

  if (topTargets.length === 1) {
    return { eliminatedPlayerId: topTargets[0]!, tie: false, tiedTargetIds: [], shouldRevote: false };
  }

  // Tie among topTargets.
  if (tieBreakRule === 'random') {
    return { eliminatedPlayerId: randomChoice(topTargets, rng), tie: true, tiedTargetIds: topTargets, shouldRevote: false };
  }
  if (tieBreakRule === 'revote' && !isRevoteAttempt) {
    // Signal to the caller: re-enter VOTING restricted to topTargets, don't eliminate yet.
    return { eliminatedPlayerId: null, tie: true, tiedTargetIds: topTargets, shouldRevote: true };
  }
  // 'no_elimination', or a 'revote' that tied again — no elimination this cycle.
  return { eliminatedPlayerId: null, tie: true, tiedTargetIds: topTargets, shouldRevote: false };
}
