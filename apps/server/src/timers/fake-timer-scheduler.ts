import type { ScheduledTimerInfo, TimerExpiryCallback, TimerScheduler } from './types.js';

/**
 * Deterministic `TimerScheduler` for tests (ARCHITECTURE.md Step 5: "Do not use real waiting times
 * in the main unit tests... Create a fake clock or controllable scheduler where tests can advance
 * time manually, run due timers, inspect scheduled timers, verify cancellation, verify replacement").
 *
 * Unlike `RealTimerScheduler`, this never calls `setTimeout` — a scheduled timer just sits in a map
 * until the test explicitly calls `advanceTo()` (fires everything at/after a given deadline) or
 * `fireNow()` (force-fires one room's timer regardless of its deadline, e.g. to simulate a duplicate
 * or racing callback). This makes every timer-driven code path in `PhaseTimerService` fully
 * synchronous and reproducible under test.
 */
export class FakeTimerScheduler implements TimerScheduler {
  private readonly timers = new Map<string, ScheduledTimerInfo>();

  constructor(private readonly onExpire: TimerExpiryCallback) {}

  schedule(roomId: string, phaseId: string, deadline: number): void {
    this.timers.set(roomId, { roomId, phaseId, deadline });
  }

  cancel(roomId: string): void {
    this.timers.delete(roomId);
  }

  getScheduled(roomId: string): ScheduledTimerInfo | null {
    return this.timers.get(roomId) ?? null;
  }

  shutdown(): void {
    this.timers.clear();
  }

  // ---- Test control surface (not part of the TimerScheduler interface) ------------------------

  /** Every room id with a currently-scheduled timer. */
  scheduledRoomIds(): string[] {
    return [...this.timers.keys()];
  }

  size(): number {
    return this.timers.size;
  }

  /**
   * Fires every timer whose deadline is `<= now`, in deadline-ascending order, removing each from
   * the schedule before invoking its callback (real one-shot `setTimeout` semantics) — so a
   * callback that itself calls `schedule()` again (e.g. the FSM auto-advancing into another timed
   * phase) is never clobbered by the entry that just fired. Awaits each callback (in order) before
   * moving to the next, so `await scheduler.advanceTo(deadline)` only resolves once every
   * downstream dispatch/persist/broadcast it triggered has fully settled — this is what makes
   * timer-driven test assertions deterministic.
   */
  async advanceTo(now: number): Promise<void> {
    const due = [...this.timers.values()].filter((t) => t.deadline <= now).sort((a, b) => a.deadline - b.deadline);
    for (const t of due) {
      // Only fire if still scheduled with the SAME deadline — a prior callback in this same batch
      // may have already cancelled or replaced this room's timer.
      const current = this.timers.get(t.roomId);
      if (!current || current.deadline !== t.deadline) continue;
      this.timers.delete(t.roomId);
      await this.onExpire(t.roomId, t.phaseId);
    }
  }

  /**
   * Force-fires whatever is scheduled for `roomId` right now, regardless of its deadline, WITHOUT
   * removing it from the schedule first — used to simulate a duplicate/racing callback arriving for
   * a timer that (from the scheduler's perspective) already fired or is still pending.
   */
  async fireNow(roomId: string): Promise<void> {
    const entry = this.timers.get(roomId);
    if (!entry) return;
    await this.onExpire(entry.roomId, entry.phaseId);
  }
}
