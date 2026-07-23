import { describe, expect, it } from 'vitest';
import { RealTimerScheduler } from '../../src/timers/real-timer-scheduler.js';

/**
 * `RealTimerScheduler` is the one place in the timer subsystem allowed to use a real `setTimeout`
 * (ARCHITECTURE.md Step 5: "Real setTimeout may be used in the production implementation only").
 * These tests use short-but-real waits to prove the wiring actually works; every OTHER test in
 * `test/timers/` drives `PhaseTimerService` through `FakeTimerScheduler` and is fully deterministic.
 */
describe('RealTimerScheduler', () => {
  it('fires the callback after roughly the scheduled delay', async () => {
    const fired: Array<[string, string]> = [];
    const scheduler = new RealTimerScheduler((roomId, phaseId) => {
      fired.push([roomId, phaseId]);
    });
    const now = Date.now();

    scheduler.schedule('room-1', 'phase-1', now + 20);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fired).toEqual([['room-1', 'phase-1']]);
    expect(scheduler.getScheduled('room-1')).toBeNull(); // one-shot: removed itself on fire
  });

  it('cancel() before the deadline prevents the callback from ever firing', async () => {
    const fired: string[] = [];
    const scheduler = new RealTimerScheduler((roomId) => {
      fired.push(roomId);
    });
    scheduler.schedule('room-1', 'phase-1', Date.now() + 20);

    scheduler.cancel('room-1');

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fired).toEqual([]);
  });

  it('scheduling again for the same room replaces (cancels) the previous timer', async () => {
    const fired: Array<[string, string]> = [];
    const scheduler = new RealTimerScheduler((roomId, phaseId) => {
      fired.push([roomId, phaseId]);
    });
    scheduler.schedule('room-1', 'phase-old', Date.now() + 15);
    scheduler.schedule('room-1', 'phase-new', Date.now() + 30);

    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(fired).toEqual([['room-1', 'phase-new']]);
  });

  it('a deadline already in the past fires almost immediately (delay clamped to 0)', async () => {
    const fired: string[] = [];
    const scheduler = new RealTimerScheduler((roomId) => {
      fired.push(roomId);
    });
    scheduler.schedule('room-1', 'phase-1', Date.now() - 5000);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fired).toEqual(['room-1']);
  });

  it('shutdown() cancels every pending timer', async () => {
    const fired: string[] = [];
    const scheduler = new RealTimerScheduler((roomId) => {
      fired.push(roomId);
    });
    scheduler.schedule('room-a', 'p', Date.now() + 20);
    scheduler.schedule('room-b', 'p', Date.now() + 20);

    scheduler.shutdown();

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fired).toEqual([]);
  });
});
