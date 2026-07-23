/**
 * The timer subsystem (ARCHITECTURE.md §1 principle 5, Development Step 5): the server owns every
 * phase deadline (`phaseStartedAt + durationMs`) and its expiry side-effect. A `TimerScheduler` is
 * deliberately dumb — it only knows "fire this callback at this deadline, for this room+phase" and
 * "cancel/replace whatever is scheduled for this room." It never reads or mutates `RoomState`, never
 * talks to `RoomActor`, and never knows about WebSockets — that orchestration lives one layer up, in
 * `PhaseTimerService` (phase-timer-service.ts), which is the actual callback boundary described in
 * ARCHITECTURE.md's Step 5 brief ("Use an event or callback boundary between timer completion and
 * gateway view broadcasting").
 *
 * Exactly one timer may be active per room at a time — scheduling a new one for the same `roomId`
 * always replaces whatever was previously scheduled (this is what "timer replacement when a newer
 * phase starts" means structurally: the caller never needs to explicitly cancel-then-schedule).
 */

export interface ScheduledTimerInfo {
  roomId: string;
  phaseId: string;
  /** Epoch ms — `phaseStartedAt + durationMs` at the moment this timer was scheduled. */
  deadline: number;
}

/**
 * Invoked when a scheduled timer's deadline is reached. Carries only ids — never a `RoomState`.
 * May return a promise: `RealTimerScheduler` treats it as fire-and-forget (a real `setTimeout`
 * callback has no caller to await it), but `FakeTimerScheduler` awaits it before `advanceTo()`/
 * `fireNow()` resolve, which is what makes timer-driven test assertions deterministic — a test can
 * `await scheduler.advanceTo(deadline)` and know the dispatch/persist/broadcast it triggered has
 * fully settled.
 */
export type TimerExpiryCallback = (roomId: string, phaseId: string) => void | Promise<void>;

export interface TimerScheduler {
  /**
   * Schedules a timer for `roomId` to fire at `deadline` for `phaseId`, replacing (cancelling) any
   * timer previously scheduled for this `roomId`. There is never more than one active timer per room.
   */
  schedule(roomId: string, phaseId: string, deadline: number): void;

  /** Cancels the currently scheduled timer for `roomId`, if any. Safe to call when none exists. */
  cancel(roomId: string): void;

  /** Read-only inspection of what's currently scheduled for `roomId`, or `null` if nothing is. */
  getScheduled(roomId: string): ScheduledTimerInfo | null;

  /** Stops the scheduler entirely, cancelling every pending timer (e.g. on server shutdown). */
  shutdown(): void;
}

/** Factory shape used by `PhaseTimerService` to construct its scheduler around its own expiry handler — avoids a construction-order cycle between the two. */
export type TimerSchedulerFactory = (onExpire: TimerExpiryCallback) => TimerScheduler;
