import { randomUUID } from 'node:crypto';
import type { Deps } from '../types/deps.js';

/**
 * The ONLY place in this package allowed to call Math.random()/Date.now()/crypto.randomUUID()
 * directly — this is the production implementation of Deps, wired up by the (not-yet-built)
 * WebSocket gateway / room manager. FSM and state-handler code must never import this file;
 * they only ever receive a `Deps` value as a parameter (tests inject a deterministic one instead).
 */
export function createDefaultDeps(): Deps {
  return {
    now: () => Date.now(),
    rng: () => Math.random(),
    generateId: () => randomUUID(),
  };
}
