import type { Deps } from '../../src/types/deps.js';

/**
 * Deterministic Deps for tests: a monotonically increasing fake clock, a seeded xorshift32 PRNG
 * (never Math.random()), and an incrementing id generator. Same seed => same sequence, every time.
 */
export function createTestDeps(seed = 1): Deps {
  let clock = 1_700_000_000_000;
  let counter = 0;
  let state = (seed >>> 0) || 1;

  const rng = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };

  return {
    now: () => (clock += 1000),
    rng,
    generateId: () => `id-${++counter}`,
  };
}
