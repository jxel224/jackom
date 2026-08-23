import type { RoomState } from '../types/room-state.js';
import type { RoomActorManager } from '../actors/room-actor-manager.js';
import { RoomConsistencyError } from '../persistence/errors.js';
import { noopRoomLogger, type RoomLogger } from '../persistence/logging.js';
import type { TimerScheduler, TimerSchedulerFactory } from './types.js';

export interface MatchClockServiceDeps {
  manager: RoomActorManager;
  createScheduler: TimerSchedulerFactory;
  now: () => number;
  onRoomMutated?: (roomId: string) => void | Promise<void>;
  logger?: RoomLogger;
}

/**
 * The match-clock counterpart to `PhaseTimerService`, kept as a fully separate service rather than
 * folded into it (GAMEPLAY_RULES_V1.md §6 / Core Logic Phase 1). Two independent concerns needed
 * two independent schedules: a room's *phase* timer and its *match* clock deadline are unrelated —
 * a special-game phase transition must not cancel the match clock's countdown, and the match clock
 * pausing/resuming must not disturb whatever phase timer happens to be running. Reusing
 * `PhaseTimerService`'s single scheduler (one timer slot per room) for both would mean the two
 * deadlines fight over that one slot, exactly what GAMEPLAY_RULES_V1.md §6 requires this
 * architecture to avoid.
 *
 * Achieving that coexistence needs no new primitive: `TimerScheduler` implementations
 * (`RealTimerScheduler`/`FakeTimerScheduler`) each own a private `Map<roomId, Entry>` — two
 * *separate instances* (one built for `PhaseTimerService`, one here) never see each other's
 * entries, so scheduling a match-clock deadline for a room can never cancel or be cancelled by
 * that same room's phase timer. `RoomActorManager.setLifecycleHooks` was changed in this phase from
 * a single replaced slot to an accumulating list specifically so both services can register their
 * own hooks without one clobbering the other's.
 */
export class MatchClockService {
  private readonly scheduler: TimerScheduler;
  private readonly logger: RoomLogger;
  private onRoomMutated?: (roomId: string) => void | Promise<void>;

  constructor(private readonly deps: MatchClockServiceDeps) {
    this.logger = deps.logger ?? noopRoomLogger;
    this.onRoomMutated = deps.onRoomMutated;
    this.scheduler = deps.createScheduler((roomId, clockId) => this.handleExpiry(roomId, clockId));

    this.deps.manager.setLifecycleHooks({
      onMutated: (room) => this.syncFromRoom(room),
      onActorCreated: (roomId) => {
        void this.recoverRoom(roomId);
      },
      onActorEvicted: (roomId) => this.cancelRoom(roomId),
    });
  }

  /** Late-binds (or replaces) the broadcast callback — mirrors `PhaseTimerService.setOnRoomMutated`. */
  setOnRoomMutated(callback: (roomId: string) => void | Promise<void>): void {
    this.onRoomMutated = callback;
  }

  getScheduled(roomId: string) {
    return this.scheduler.getScheduled(roomId);
  }

  /** Schedules/cancels based on the room's CURRENT match clock — running with a deadline gets a timer, anything else doesn't. */
  syncFromRoom(room: RoomState): void {
    const { matchClock } = room;
    if (matchClock.status !== 'running' || matchClock.deadlineAt === null) {
      this.scheduler.cancel(room.roomId);
      return;
    }
    this.scheduler.schedule(room.roomId, matchClock.clockId, matchClock.deadlineAt);
  }

  cancelRoom(roomId: string): void {
    this.scheduler.cancel(roomId);
  }

  /** Same recovery contract as `PhaseTimerService.recoverRoom` — never resets to a fresh 15:00, only ever recovers the persisted deadline. */
  async recoverRoom(roomId: string): Promise<void> {
    let snapshot;
    try {
      snapshot = await this.deps.manager.get(roomId).getOrLoadSnapshot();
    } catch (err) {
      this.logFailure(roomId, 'recovery_load_failed', err);
      return;
    }

    const { matchClock } = snapshot.room;
    if (matchClock.status !== 'running' || matchClock.deadlineAt === null) {
      this.scheduler.cancel(roomId);
      return;
    }
    if (matchClock.deadlineAt <= this.deps.now()) {
      await this.handleExpiry(roomId, matchClock.clockId);
      return;
    }
    this.scheduler.schedule(roomId, matchClock.clockId, matchClock.deadlineAt);
  }

  shutdown(): void {
    this.scheduler.shutdown();
  }

  private async handleExpiry(roomId: string, clockId: string): Promise<void> {
    const actor = this.deps.manager.get(roomId);

    let snapshot;
    try {
      snapshot = await actor.getOrLoadSnapshot();
    } catch (err) {
      if (err instanceof RoomConsistencyError) {
        this.scheduler.cancel(roomId);
        this.logFailure(roomId, 'room_unavailable', err);
        return;
      }
      this.logFailure(roomId, 'snapshot_load_failed', err);
      return;
    }

    if (snapshot.room.matchClock.status !== 'running' || snapshot.room.matchClock.clockId !== clockId) {
      // Stale: the clock was paused (special game), resumed with a new clockId, or the match
      // already ended some other way. Harmless no-op — the same shape as a stale phase timer.
      this.logger({ roomId, event: 'match_clock_stale_ignored', detail: { clockId } });
      return;
    }

    let result;
    try {
      result = await actor.dispatch({ type: 'matchClock:expired', clockId }, { kind: 'host' });
    } catch (err) {
      this.logFailure(roomId, 'dispatch_failed', err);
      return;
    }

    if (result.rejected) {
      this.logger({ roomId, event: 'match_clock_dispatch_rejected', detail: { code: result.rejected.code } });
      return;
    }

    this.syncFromRoom(result.room);

    try {
      await this.onRoomMutated?.(roomId);
    } catch (err) {
      this.logFailure(roomId, 'broadcast_failed', err);
    }
  }

  private logFailure(roomId: string, event: string, err: unknown): void {
    const errorKind = err instanceof Error ? err.constructor.name : typeof err;
    this.logger({ roomId, event: `match_clock_${event}`, detail: { errorKind } });
  }
}
