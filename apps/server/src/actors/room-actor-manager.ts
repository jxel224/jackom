import type { RoomConfig } from '../shared.js';
import type { Deps } from '../types/deps.js';
import { createRoom } from '../fsm/room-lifecycle.js';
import { RoomActor } from './room-actor.js';
import type { RoomStateRepository } from '../persistence/room-state-repo.js';
import type { RoomPrivateStateRepository } from '../persistence/room-private-state-repo.js';
import type { RoomLookupRepository } from '../persistence/room-lookup-repo.js';
import type { SessionRepository } from '../persistence/session-repo.js';
import { DEFAULT_ROOM_TTL_SECONDS } from '../persistence/config.js';
import { noopRoomLogger, type RoomLogger } from '../persistence/logging.js';

export interface RoomActorManagerDeps {
  fsmDeps: Deps;
  roomStateRepo: RoomStateRepository;
  roomPrivateStateRepo: RoomPrivateStateRepository;
  roomLookupRepo: RoomLookupRepository;
  sessionRepo: SessionRepository;
  ttlSeconds?: number;
  logger?: RoomLogger;
}

export interface CreatedRoomHandle {
  roomId: string;
  roomCode: string;
  hostSessionToken: string;
}

/**
 * Owns the in-process map of `roomId -> RoomActor`. This — plus one `RoomActor` per room owning
 * its own serialized queue — IS the whole MVP concurrency story (ARCHITECTURE.md §7.1): a single
 * Node process, no distributed lock, Redis used purely for persistence/recovery.
 */
export class RoomActorManager {
  private readonly actors = new Map<string, RoomActor>();
  private readonly ttlSeconds: number;
  private readonly logger: RoomLogger;

  constructor(private readonly deps: RoomActorManagerDeps) {
    this.ttlSeconds = deps.ttlSeconds ?? DEFAULT_ROOM_TTL_SECONDS;
    this.logger = deps.logger ?? noopRoomLogger;
  }

  private buildActorDeps() {
    return {
      fsmDeps: this.deps.fsmDeps,
      roomStateRepo: this.deps.roomStateRepo,
      roomPrivateStateRepo: this.deps.roomPrivateStateRepo,
      roomLookupRepo: this.deps.roomLookupRepo,
      sessionRepo: this.deps.sessionRepo,
      ttlSeconds: this.ttlSeconds,
      logger: this.logger,
    };
  }

  /**
   * Persists a brand-new room (public state, private state, roomCode lookup, host session) and
   * registers a pre-hydrated actor for it in the same call — "room creation persistence."
   */
  async createRoom(config: RoomConfig): Promise<CreatedRoomHandle> {
    const { room, priv, hostSessionToken } = createRoom(config, this.deps.fsmDeps);

    await this.deps.roomStateRepo.save(room, this.ttlSeconds);
    await this.deps.roomPrivateStateRepo.save(priv, this.ttlSeconds);
    await this.deps.roomLookupRepo.setRoomCode(room.roomCode, room.roomId, this.ttlSeconds);
    await this.deps.sessionRepo.setHostSession(hostSessionToken, { roomId: room.roomId }, this.ttlSeconds);

    const actor = new RoomActor(room.roomId, this.buildActorDeps(), { room, priv });
    this.actors.set(room.roomId, actor);

    return { roomId: room.roomId, roomCode: room.roomCode, hostSessionToken };
  }

  /**
   * Get-or-create the actor for `roomId`. A freshly-created actor here is NOT pre-hydrated — its
   * first `dispatch()` call will lazily load from Redis (`RoomActor.ensureLoaded`), which is what
   * "actor recreation loads the latest Redis state" actually means: after `evict()`, the next
   * `get()` for the same roomId returns a brand-new object with no memory of the old one.
   */
  get(roomId: string): RoomActor {
    const existing = this.actors.get(roomId);
    if (existing) return existing;
    const created = new RoomActor(roomId, this.buildActorDeps());
    this.actors.set(roomId, created);
    return created;
  }

  async getByRoomCode(roomCode: string): Promise<RoomActor | null> {
    const roomId = await this.deps.roomLookupRepo.resolveRoomCode(roomCode);
    if (!roomId) return null;
    return this.get(roomId);
  }

  has(roomId: string): boolean {
    return this.actors.has(roomId);
  }

  size(): number {
    return this.actors.size;
  }

  /** Removes the actor from memory. Refuses while it's mid-`dispatch()`; returns whether it was evicted. */
  evict(roomId: string): boolean {
    const actor = this.actors.get(roomId);
    if (!actor) return false;
    if (actor.isBusy()) return false;
    return this.actors.delete(roomId);
  }

  /** Evicts every non-busy actor idle for at least `idleThresholdMs`, returning the evicted roomIds. */
  evictIdle(idleThresholdMs: number): string[] {
    const now = this.deps.fsmDeps.now();
    const evicted: string[] = [];
    for (const [roomId, actor] of this.actors.entries()) {
      if (actor.isBusy()) continue;
      if (now - actor.getLastActivityAt() >= idleThresholdMs) {
        this.actors.delete(roomId);
        evicted.push(roomId);
      }
    }
    return evicted;
  }
}
