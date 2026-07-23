import type { ScheduledTimerInfo, TimerExpiryCallback, TimerScheduler } from './types.js';

interface Entry {
  phaseId: string;
  deadline: number;
  handle: ReturnType<typeof setTimeout>;
}

/**
 * Production `TimerScheduler` — real `setTimeout` per room, cleared/replaced on every `schedule()`
 * call. This is the ONLY file in the timer subsystem allowed to touch `setTimeout`/`Date.now`
 * directly (mirrors the `fsm/default-deps.ts` convention: exactly one file is the real-clock
 * boundary, everything else is deterministic and injectable — see `FakeTimerScheduler` for tests).
 */
export class RealTimerScheduler implements TimerScheduler {
  private readonly timers = new Map<string, Entry>();

  constructor(
    private readonly onExpire: TimerExpiryCallback,
    private readonly now: () => number = Date.now,
  ) {}

  schedule(roomId: string, phaseId: string, deadline: number): void {
    this.cancel(roomId);
    const delayMs = Math.max(0, deadline - this.now());
    const handle = setTimeout(() => {
      // One-shot: remove ourselves before invoking the callback so a re-entrant schedule() call
      // made from within the callback (e.g. auto-advance landing on another timed phase) is never
      // clobbered by this now-fired entry.
      this.timers.delete(roomId);
      // Fire-and-forget: a real setTimeout callback has no caller to await. handleExpiry() (the
      // only production caller) never lets an internal error escape as a rejection, but this catch
      // is a last-resort backstop against an unhandled rejection crashing the process.
      Promise.resolve(this.onExpire(roomId, phaseId)).catch(() => {});
    }, delayMs);
    // Node timers keep the event loop alive by default; timers are short-lived phase windows, not
    // something that should block process shutdown, so let the process exit if this is all that's left.
    handle.unref?.();
    this.timers.set(roomId, { phaseId, deadline, handle });
  }

  cancel(roomId: string): void {
    const existing = this.timers.get(roomId);
    if (!existing) return;
    clearTimeout(existing.handle);
    this.timers.delete(roomId);
  }

  getScheduled(roomId: string): ScheduledTimerInfo | null {
    const existing = this.timers.get(roomId);
    if (!existing) return null;
    return { roomId, phaseId: existing.phaseId, deadline: existing.deadline };
  }

  shutdown(): void {
    for (const entry of this.timers.values()) {
      clearTimeout(entry.handle);
    }
    this.timers.clear();
  }
}
