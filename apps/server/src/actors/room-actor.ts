import type { EventSender, InboundEvent } from '../shared.js';
import type { Deps } from '../types/deps.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';
import { handleEvent } from '../fsm/transitions.js';
import type { HandleEventResult, Rejection } from '../fsm/result.js';
import type { RoomStateRepository } from '../persistence/room-state-repo.js';
import type { RoomPrivateStateRepository } from '../persistence/room-private-state-repo.js';
import type { RoomLookupRepository } from '../persistence/room-lookup-repo.js';
import type { SessionRepository } from '../persistence/session-repo.js';
import { RoomConsistencyError } from '../persistence/errors.js';
import { noopRoomLogger, type RoomLogger } from '../persistence/logging.js';

export interface RoomActorDeps {
  fsmDeps: Deps;
  roomStateRepo: RoomStateRepository;
  roomPrivateStateRepo: RoomPrivateStateRepository;
  roomLookupRepo: RoomLookupRepository;
  sessionRepo: SessionRepository;
  ttlSeconds: number;
  logger?: RoomLogger;
}

export interface LifecycleOutcome<T> {
  room: RoomState;
  priv: RoomPrivateState;
  value: T;
  rejected?: Rejection;
}

/**
 * One actor per room: an async queue that processes inbound events strictly one at a time
 * (ARCHITECTURE.md §7.1 MVP concurrency model — no distributed lock, because there is exactly one
 * process and exactly one queue per room). Loads lazily from Redis on first dispatch if not
 * already hydrated, persists only accepted (non-rejected) results, and refreshes the TTLs of
 * everything tied to this room's lifetime (room state, roomCode lookup, host session, every player
 * session) on every accepted mutation.
 *
 * Two capabilities were added in Step 4 (the WebSocket gateway), both reusing the exact same
 * queue/persist machinery as FSM event dispatch:
 *  - `getOrLoadSnapshot()` — lets the gateway read a room's current state (e.g. to build a view
 *    right after a reconnect) without needing to fabricate a fake FSM event just to trigger a load.
 *  - `runLifecycle()` — lets the gateway run join/leave/profile-update (the pure functions in
 *    fsm/room-lifecycle.ts, which are NOT part of the handleEvent() switch — see ARCHITECTURE.md
 *    §9: "join/leave/setProfile mutate room.players directly, no transition") through the SAME
 *    serialized queue and persistence path as everything else, so two players joining at the same
 *    moment can never race on the room's player map.
 */
export class RoomActor {
  private room: RoomState | null;
  private priv: RoomPrivateState | null;
  private loaded: boolean;
  private queue: Promise<void> = Promise.resolve();
  private busy = false;
  private lastActivityAt: number;
  private readonly logger: RoomLogger;

  constructor(
    private readonly roomId: string,
    private readonly deps: RoomActorDeps,
    initial?: { room: RoomState; priv: RoomPrivateState },
  ) {
    this.room = initial?.room ?? null;
    this.priv = initial?.priv ?? null;
    this.loaded = initial !== undefined;
    this.logger = deps.logger ?? noopRoomLogger;
    this.lastActivityAt = deps.fsmDeps.now();
  }

  isBusy(): boolean {
    return this.busy;
  }

  getLastActivityAt(): number {
    return this.lastActivityAt;
  }

  /** Snapshot of the actor's current in-memory state, for read-only inspection (e.g. building views). Null until loaded. */
  getSnapshot(): { room: RoomState; priv: RoomPrivateState } | null {
    return this.room && this.priv ? { room: this.room, priv: this.priv } : null;
  }

  /** Like getSnapshot(), but loads from the repositories first (via the queue) if not already hydrated. */
  getOrLoadSnapshot(): Promise<{ room: RoomState; priv: RoomPrivateState }> {
    if (this.loaded) {
      return Promise.resolve({ room: this.room!, priv: this.priv! });
    }
    return this.runSerialized(async () => {
      await this.ensureLoaded();
      return { room: this.room!, priv: this.priv! };
    });
  }

  /**
   * Enqueues `event` behind whatever is already queued for this room, guaranteeing strictly
   * sequential processing — this is the serialization guarantee: every dispatch chains onto the
   * SAME `this.queue` promise, so a second call's work cannot start until the first call's work
   * (including its Redis persistence) has fully settled, no matter how close together they're invoked.
   */
  dispatch(event: InboundEvent, sender: EventSender): Promise<HandleEventResult> {
    return this.runSerialized(async () => {
      await this.ensureLoaded();
      const result = handleEvent(this.room!, this.priv!, event, sender, this.deps.fsmDeps);

      if (!result.rejected) {
        await this.persist(result.room, result.priv);
        this.room = result.room;
        this.priv = result.priv;
      }
      // Rejections are deliberately NOT persisted — this.room/this.priv stay exactly as they were.

      this.lastActivityAt = this.deps.fsmDeps.now();
      return result;
    });
  }

  /**
   * Runs a pure room-lifecycle operation (join/leave/setProfile/kick — see fsm/room-lifecycle.ts)
   * through the same serialized queue and persist-only-on-accept path as `dispatch()`. `op` must be
   * a pure function of (room, priv, fsmDeps) — exactly the shape of the Step 2 lifecycle functions.
   */
  runLifecycle<T>(op: (room: RoomState, priv: RoomPrivateState, deps: Deps) => LifecycleOutcome<T>): Promise<LifecycleOutcome<T>> {
    return this.runSerialized(async () => {
      await this.ensureLoaded();
      const outcome = op(this.room!, this.priv!, this.deps.fsmDeps);

      if (!outcome.rejected) {
        await this.persist(outcome.room, outcome.priv);
        this.room = outcome.room;
        this.priv = outcome.priv;
      }

      this.lastActivityAt = this.deps.fsmDeps.now();
      return outcome;
    });
  }

  /** Chains `work` onto the room's single queue and tracks the busy flag for its duration. */
  private runSerialized<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work);
    // Normalize to a resolved promise for queue-chaining purposes only, so one failure never
    // breaks the chain for work queued behind it. The caller still receives `task` itself, which
    // retains its real rejection/resolution.
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return this.trackBusy(task);
  }

  private async trackBusy<T>(task: Promise<T>): Promise<T> {
    this.busy = true;
    try {
      return await task;
    } finally {
      this.busy = false;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    const [room, priv] = await Promise.all([
      this.deps.roomStateRepo.load(this.roomId),
      this.deps.roomPrivateStateRepo.load(this.roomId),
    ]);

    if (!room && !priv) {
      throw new RoomConsistencyError('ROOM_NOT_FOUND', this.roomId);
    }
    if (room && !priv) {
      throw new RoomConsistencyError('PRIVATE_STATE_MISSING', this.roomId);
    }
    if (!room && priv) {
      throw new RoomConsistencyError('PUBLIC_STATE_MISSING', this.roomId);
    }

    this.room = room;
    this.priv = priv;
    this.loaded = true;
  }

  /**
   * Persists both halves. If the private-state write fails after the public-state write already
   * succeeded, best-effort deletes the just-written public half rather than leaving Redis with a
   * public/private mismatch — "do not silently continue with mismatched public/private state."
   * Either way, a thrown error here means the caller will NOT update this.room/this.priv, so the
   * actor's in-memory authoritative copy never drifts ahead of what's actually durable.
   */
  private async persist(room: RoomState, priv: RoomPrivateState): Promise<void> {
    let publicSaved = false;
    try {
      await this.deps.roomStateRepo.save(room, this.deps.ttlSeconds);
      publicSaved = true;
      await this.deps.roomPrivateStateRepo.save(priv, this.deps.ttlSeconds);
    } catch (cause) {
      if (publicSaved) {
        try {
          await this.deps.roomStateRepo.delete(room.roomId);
        } catch {
          // Best-effort only — the PARTIAL_PERSISTENCE_FAILURE thrown below is the authoritative signal.
        }
      }
      this.logger({ roomId: room.roomId, event: 'persist_failed', detail: { publicSaved } });
      void cause; // preserved only for the logger call above — never included in the thrown error's message
      throw new RoomConsistencyError('PARTIAL_PERSISTENCE_FAILURE', room.roomId);
    }

    await this.refreshDerivedTtls(room, priv);
  }

  /** Best-effort: a failure to refresh a secondary lookup/session TTL must not fail the whole mutation. */
  private async refreshDerivedTtls(room: RoomState, priv: RoomPrivateState): Promise<void> {
    const refreshes: Array<Promise<void>> = [
      this.deps.roomLookupRepo.refreshTtl(room.roomCode, this.deps.ttlSeconds),
      this.deps.sessionRepo.refreshHostSessionTtl(room.host.hostSessionToken, this.deps.ttlSeconds),
      ...Object.values(priv.players).map((p) => this.deps.sessionRepo.refreshPlayerSessionTtl(p.sessionToken, this.deps.ttlSeconds)),
    ];
    const outcomes = await Promise.allSettled(refreshes);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        this.logger({ roomId: room.roomId, event: 'ttl_refresh_failed' });
      }
    }
  }
}
