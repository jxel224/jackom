import type { Deps } from '../types/deps.js';

/** Fisher-Yates shuffle driven entirely by the injected rng — never Math.random(). */
export function shuffle<T>(items: T[], rng: Deps['rng']): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

/** Picks `count` distinct items from `pool`, clamped to `pool.length`. */
export function randomSubset<T>(pool: T[], count: number, rng: Deps['rng']): T[] {
  const clamped = Math.max(0, Math.min(count, pool.length));
  return shuffle(pool, rng).slice(0, clamped);
}

export function randomChoice<T>(pool: T[], rng: Deps['rng']): T {
  if (pool.length === 0) {
    throw new Error('randomChoice: pool is empty');
  }
  const index = Math.floor(rng() * pool.length);
  return pool[Math.min(index, pool.length - 1)]!;
}
