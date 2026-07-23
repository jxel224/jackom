import { describe, expect, it } from 'vitest';
import { FakeTimerScheduler } from '../../src/timers/fake-timer-scheduler.js';

describe('FakeTimerScheduler', () => {
  it('schedule() records a timer that does NOT fire on its own', () => {
    const fired: Array<[string, string]> = [];
    const scheduler = new FakeTimerScheduler((roomId, phaseId) => {
      fired.push([roomId, phaseId]);
    });

    scheduler.schedule('room-1', 'phase-1', 1000);

    expect(scheduler.getScheduled('room-1')).toEqual({ roomId: 'room-1', phaseId: 'phase-1', deadline: 1000 });
    expect(fired).toEqual([]); // no real setTimeout — nothing fires until advanceTo()/fireNow()
  });

  it('advanceTo() fires every timer whose deadline has been reached, and only those', async () => {
    const fired: Array<[string, string]> = [];
    const scheduler = new FakeTimerScheduler((roomId, phaseId) => {
      fired.push([roomId, phaseId]);
    });
    scheduler.schedule('room-early', 'phase-a', 1000);
    scheduler.schedule('room-late', 'phase-b', 5000);

    await scheduler.advanceTo(2000);

    expect(fired).toEqual([['room-early', 'phase-a']]);
    expect(scheduler.getScheduled('room-early')).toBeNull(); // fired timers are removed
    expect(scheduler.getScheduled('room-late')).not.toBeNull(); // not due yet
  });

  it('advanceTo() fires due timers in deadline-ascending order', async () => {
    const order: string[] = [];
    const scheduler = new FakeTimerScheduler((roomId) => {
      order.push(roomId);
    });
    scheduler.schedule('room-b', 'p', 2000);
    scheduler.schedule('room-a', 'p', 1000);
    scheduler.schedule('room-c', 'p', 3000);

    await scheduler.advanceTo(10_000);

    expect(order).toEqual(['room-a', 'room-b', 'room-c']);
  });

  it('cancel() removes a scheduled timer so advanceTo() never fires it', async () => {
    const fired: string[] = [];
    const scheduler = new FakeTimerScheduler((roomId) => {
      fired.push(roomId);
    });
    scheduler.schedule('room-1', 'phase-1', 1000);

    scheduler.cancel('room-1');
    await scheduler.advanceTo(10_000);

    expect(fired).toEqual([]);
    expect(scheduler.getScheduled('room-1')).toBeNull();
  });

  it('cancel() on a room with nothing scheduled is a safe no-op', () => {
    const scheduler = new FakeTimerScheduler(() => {});
    expect(() => scheduler.cancel('never-scheduled')).not.toThrow();
  });

  it('schedule() replaces (never accumulates) whatever was previously scheduled for the same room', async () => {
    const fired: Array<[string, string]> = [];
    const scheduler = new FakeTimerScheduler((roomId, phaseId) => {
      fired.push([roomId, phaseId]);
    });
    scheduler.schedule('room-1', 'phase-old', 1000);
    scheduler.schedule('room-1', 'phase-new', 5000);

    expect(scheduler.size()).toBe(1);
    expect(scheduler.getScheduled('room-1')).toEqual({ roomId: 'room-1', phaseId: 'phase-new', deadline: 5000 });

    await scheduler.advanceTo(1000); // would have fired phase-old, but it was replaced
    expect(fired).toEqual([]);

    await scheduler.advanceTo(5000);
    expect(fired).toEqual([['room-1', 'phase-new']]);
  });

  it('a callback that re-schedules mid-advanceTo() is not clobbered by the batch that triggered it', async () => {
    const scheduler = new FakeTimerScheduler((roomId, phaseId) => {
      if (phaseId === 'phase-1') {
        scheduler.schedule(roomId, 'phase-2', 5000); // simulate auto-advance into another timed phase
      }
    });
    scheduler.schedule('room-1', 'phase-1', 1000);

    await scheduler.advanceTo(1000);

    expect(scheduler.getScheduled('room-1')).toEqual({ roomId: 'room-1', phaseId: 'phase-2', deadline: 5000 });
  });

  it('two rooms schedule and fire completely independently', async () => {
    const fired: Array<[string, string]> = [];
    const scheduler = new FakeTimerScheduler((roomId, phaseId) => {
      fired.push([roomId, phaseId]);
    });
    scheduler.schedule('room-a', 'phase-a', 1000);
    scheduler.schedule('room-b', 'phase-b', 1000);

    scheduler.cancel('room-a');
    await scheduler.advanceTo(1000);

    expect(fired).toEqual([['room-b', 'phase-b']]);
  });

  it('fireNow() force-fires regardless of deadline, WITHOUT removing the entry (simulates a duplicate/racing callback)', async () => {
    const fired: Array<[string, string]> = [];
    const scheduler = new FakeTimerScheduler((roomId, phaseId) => {
      fired.push([roomId, phaseId]);
    });
    scheduler.schedule('room-1', 'phase-1', 999_999); // far in the future

    await scheduler.fireNow('room-1');
    await scheduler.fireNow('room-1'); // duplicate

    expect(fired).toEqual([
      ['room-1', 'phase-1'],
      ['room-1', 'phase-1'],
    ]);
    expect(scheduler.getScheduled('room-1')).not.toBeNull(); // fireNow() does not consume the schedule entry
  });

  it('shutdown() clears every pending timer', async () => {
    const fired: string[] = [];
    const scheduler = new FakeTimerScheduler((roomId) => {
      fired.push(roomId);
    });
    scheduler.schedule('room-a', 'p', 1000);
    scheduler.schedule('room-b', 'p', 1000);

    scheduler.shutdown();
    await scheduler.advanceTo(10_000);

    expect(fired).toEqual([]);
    expect(scheduler.size()).toBe(0);
  });
});
