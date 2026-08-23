import type { MatchClock } from '../shared.js';
import type { Deps } from '../types/deps.js';

/**
 * The clock's "not started yet" state — set at role assignment and at match reset. Investigation
 * gameplay hasn't begun, so there is nothing counting down (GAMEPLAY_RULES_V1.md §2).
 */
export function initMatchClock(): MatchClock {
  return {
    status: 'pending',
    clockId: '',
    startedAt: null,
    deadlineAt: null,
    remainingMs: 0,
    totalPenaltyMs: 0,
  };
}

/** Starts the clock running for the first time — called once, the moment GAME_INTRO exits (GAMEPLAY_RULES_V1.md §2). */
export function startMatchClock(totalMs: number, deps: Deps): MatchClock {
  const now = deps.now();
  return {
    status: 'running',
    clockId: deps.generateId(),
    startedAt: now,
    deadlineAt: now + totalMs,
    remainingMs: totalMs,
    totalPenaltyMs: 0,
  };
}

/** Snapshots remaining time and stops counting down — used while the special game is active. */
export function pauseMatchClock(clock: MatchClock, deps: Deps): MatchClock {
  if (clock.status !== 'running' || clock.deadlineAt === null) return clock;
  const remainingMs = Math.max(0, clock.deadlineAt - deps.now());
  return { ...clock, status: 'paused', deadlineAt: null, remainingMs };
}

/** Resumes counting down from `remainingMs`, minting a fresh `clockId` (a resume is a new "epoch" for staleness purposes). */
export function resumeMatchClock(clock: MatchClock, deps: Deps): MatchClock {
  if (clock.status !== 'paused') return clock;
  const now = deps.now();
  return { ...clock, status: 'running', clockId: deps.generateId(), deadlineAt: now + clock.remainingMs };
}

/**
 * Applies the special-game failure penalty to a paused clock's remaining time, clamped at zero.
 * Does NOT resume — the caller decides whether to resume (time left) or end the match (none left).
 */
export function applyPenalty(clock: MatchClock, penaltyMs: number): MatchClock {
  const remainingMs = Math.max(0, clock.remainingMs - penaltyMs);
  return { ...clock, remainingMs, totalPenaltyMs: clock.totalPenaltyMs + penaltyMs };
}

/** Terminal state — the match is over, however it ended. `remainingMs` is left as whatever it last was (0 if the clock itself ran out). */
export function stopMatchClock(clock: MatchClock): MatchClock {
  return { ...clock, status: 'stopped', deadlineAt: null };
}
