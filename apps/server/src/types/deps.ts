/**
 * Deterministic dependency injection for randomness and time. FSM/state-handler code must never
 * call `Math.random()` or `Date.now()` directly — everything flows through a `Deps` instance so
 * tests are fully repeatable. Only apps/server/src/fsm/default-deps.ts (the production boundary,
 * not itself FSM logic) is allowed to touch the real clock/RNG.
 */
export interface Deps {
  /** Epoch milliseconds. */
  now(): number;
  /** A float in [0, 1), like Math.random(). */
  rng(): number;
  /** A fresh unique id (phaseId, actionId, sessionToken, playerId, etc). */
  generateId(): string;
}
