import type { RoomState } from '../types/room-state.js';
import type { RoomActorManager } from '../actors/room-actor-manager.js';
import { RoomConsistencyError } from '../persistence/errors.js';
import { noopRoomLogger, type RoomLogger } from '../persistence/logging.js';
import type { TimerScheduler, TimerSchedulerFactory } from './types.js';

export interface PhaseTimerServiceDeps {
  manager: RoomActorManager;
  createScheduler: TimerSchedulerFactory;
  /** Server clock — used only to decide "is this recovered deadline already overdue," never to mutate RoomState. */
  now: () => number;
  /**
   * The callback boundary into the WebSocket gateway (ARCHITECTURE.md Step 5: "the timer scheduler
   * must not know WebSocket message formats directly"). Called with just a `roomId` after a
   * timer-driven mutation is accepted and persisted; the caller (typically `GatewayServer`) is
   * responsible for building/sending the actual views. A rejected/no-op expiry never calls this.
   */
  onRoomMutated?: (roomId: string) => void | Promise<void>;
  logger?: RoomLogger;
}

/**
 * Coordinates server-owned phase-expiry timers on top of `RoomActorManager` (ARCHITECTURE.md
 * Development Step 5). This is the ONLY thing in the timer subsystem that ever touches `RoomState`
 * (read-only) or calls `RoomActor.dispatch()` — the `TimerScheduler` itself is pure id/deadline
 * bookkeeping (types.ts).
 *
 * Wiring: constructed with a `RoomActorManager`; registers itself as that manager's lifecycle hooks
 * (`onMutated` / `onActorCreated` / `onActorEvicted`) so every accepted mutation, actor
 * (re)creation, and eviction automatically keeps the scheduled timer in sync — callers never need to
 * remember to call into this service from every dispatch site.
 */
export class PhaseTimerService {
  private readonly scheduler: TimerScheduler;
  private readonly logger: RoomLogger;
  private onRoomMutated?: (roomId: string) => void | Promise<void>;

  constructor(private readonly deps: PhaseTimerServiceDeps) {
    this.logger = deps.logger ?? noopRoomLogger;
    this.onRoomMutated = deps.onRoomMutated;
    this.scheduler = deps.createScheduler((roomId, phaseId) => this.handleExpiry(roomId, phaseId));

    this.deps.manager.setLifecycleHooks({
      onMutated: (room) => this.syncFromRoom(room),
      onActorCreated: (roomId) => {
        void this.recoverRoom(roomId);
      },
      onActorEvicted: (roomId) => this.cancelRoom(roomId),
    });
  }

  /** Late-binds (or replaces) the broadcast callback — used by `GatewayServer` to wire itself in after construction, keeping the scheduler ignorant of wire formats. */
  setOnRoomMutated(callback: (roomId: string) => void | Promise<void>): void {
    this.onRoomMutated = callback;
  }

  getScheduled(roomId: string) {
    return this.scheduler.getScheduled(roomId);
  }

  /**
   * Schedules (or cancels/replaces) the timer for `room`'s CURRENT phase. Called automatically via
   * the `onMutated` lifecycle hook after every accepted `RoomActor` mutation — this is what
   * implements "timer scheduling after phase transitions," "cancellation when a phase changes," and
   * "replacement when a newer phase starts" as one uniform rule: whatever phase the room is in right
   * now is what gets scheduled, unconditionally superseding anything scheduled before.
   */
  syncFromRoom(room: RoomState): void {
    const { phase } = room;
    if (phase.durationMs === null) {
      // Host-paced phase (§ Timer Authority Rules) — no timer, wait for a host/player action.
      this.scheduler.cancel(room.roomId);
      return;
    }
    this.scheduler.schedule(room.roomId, phase.phaseId, phase.phaseStartedAt + phase.durationMs);
  }

  /** Cancels whatever is scheduled for `roomId` — used directly on actor eviction, and available for room-expiry cleanup. */
  cancelRoom(roomId: string): void {
    this.scheduler.cancel(roomId);
  }

  /**
   * Recovery entry point (ARCHITECTURE.md "Recovery Behaviour"): called automatically whenever
   * `RoomActorManager` creates a NOT-pre-hydrated actor (a fresh process, or an actor recreated
   * after eviction) via the `onActorCreated` lifecycle hook. Loads the room's current snapshot
   * (from Redis, via the same repository path every other read uses) and either schedules the
   * remaining time or, if the deadline already passed, dispatches `timer:expired` immediately
   * instead of registering a timer at all — "do not reset the timer to its original full duration."
   */
  async recoverRoom(roomId: string): Promise<void> {
    let snapshot;
    try {
      snapshot = await this.deps.manager.get(roomId).getOrLoadSnapshot();
    } catch (err) {
      this.logFailure(roomId, 'recovery_load_failed', err);
      return;
    }

    const { phase } = snapshot.room;
    if (phase.durationMs === null) {
      this.scheduler.cancel(roomId);
      return;
    }
    const deadline = phase.phaseStartedAt + phase.durationMs;
    if (deadline <= this.deps.now()) {
      await this.handleExpiry(roomId, phase.phaseId);
      return;
    }
    this.scheduler.schedule(roomId, phase.phaseId, deadline);
  }

  /** Stops the underlying scheduler, cancelling every pending timer (server shutdown). */
  shutdown(): void {
    this.scheduler.shutdown();
  }

  /**
   * The actual expiry handler — the callback boundary the `TimerScheduler` fires into. Implements
   * ARCHITECTURE.md's "When a timer fires" contract exactly:
   *   1/2. reload the latest snapshot via the actor (which may itself recover from Redis),
   *   3.   confirm the current phaseId still matches the timer's phaseId (stale timer protection),
   *   4.   dispatch timer:expired through the RoomActor (same serialized queue as any client event),
   *   5.   persistence already happened inside RoomActor.dispatch() before this returns,
   *   6.   notify the broadcast boundary (never rolled back on failure — state is already durable).
   */
  private async handleExpiry(roomId: string, phaseId: string): Promise<void> {
    const actor = this.deps.manager.get(roomId);

    let snapshot;
    try {
      snapshot = await actor.getOrLoadSnapshot();
    } catch (err) {
      if (err instanceof RoomConsistencyError) {
        // The room genuinely no longer exists (or is inconsistent) — nothing to retry; drop any
        // stray schedule entry so we never spin on a dead room.
        this.scheduler.cancel(roomId);
        this.logFailure(roomId, 'room_unavailable', err);
        return;
      }
      this.logFailure(roomId, 'snapshot_load_failed', err);
      return;
    }

    if (snapshot.room.phase.phaseId !== phaseId) {
      // Stale: a host skip, a player action completing the phase early, or another timer callback
      // already moved the room to a different phase. Do nothing — this is the expected, harmless
      // outcome for a late/duplicate/superseded timer callback, not an error.
      this.logger({ roomId, event: 'timer_stale_ignored', detail: { phaseId } });
      return;
    }
    if (snapshot.room.phase.durationMs === null) {
      // Defensive only — a phaseId match already implies the phase hasn't changed, so durationMs
      // can't have changed either. Never dispatch a spurious expiry for a host-paced phase.
      return;
    }

    let result;
    try {
      result = await actor.dispatch({ type: 'timer:expired', phaseId }, { kind: 'host' });
    } catch (err) {
      this.logFailure(roomId, 'dispatch_failed', err);
      return;
    }

    if (result.rejected) {
      // The FSM's own staleness/validity guard caught a race our pre-check missed (e.g. a
      // simultaneous player action accepted a moment earlier in the same serialized queue) — the
      // timer callback becomes harmless, exactly as required.
      this.logger({ roomId, event: 'timer_dispatch_rejected', detail: { code: result.rejected.code } });
      return;
    }

    // `syncFromRoom` also runs via the `onMutated` hook fired inside `actor.dispatch()` itself, but
    // calling it again here is idempotent (schedule/cancel are last-write-wins) and keeps this
    // method correct even if the hook is ever bypassed.
    this.syncFromRoom(result.room);

    try {
      await this.onRoomMutated?.(roomId);
    } catch (err) {
      // Architecture rule: "A failed view broadcast must not roll back an already-persisted
      // authoritative state transition." The mutation above already committed; a broadcast failure
      // is logged and swallowed, never re-thrown.
      this.logFailure(roomId, 'broadcast_failed', err);
    }
  }

  private logFailure(roomId: string, event: string, err: unknown): void {
    // Never include the raw error (message/stack may embed request/state content) — only a
    // sanitized error-kind label, matching the same discipline as persistence/validate.ts.
    const errorKind = err instanceof Error ? err.constructor.name : typeof err;
    this.logger({ roomId, event: `timer_${event}`, detail: { errorKind } });
  }
}
