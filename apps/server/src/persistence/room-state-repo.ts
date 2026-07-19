import type { RoomState } from '../types/room-state.js';
import type { KeyValueStore } from './kv-store.js';
import { RoomStateSchema } from './schemas.js';
import { parseStoredJson } from './validate.js';
import { roomStateKey } from './keys.js';
import { DEFAULT_ROOM_TTL_SECONDS } from './config.js';
import { wrapStoreError } from './errors.js';

export interface RoomStateRepository {
  save(room: RoomState, ttlSeconds?: number): Promise<void>;
  load(roomId: string): Promise<RoomState | null>;
  delete(roomId: string): Promise<void>;
  refreshTtl(roomId: string, ttlSeconds?: number): Promise<void>;
}

/**
 * A single implementation, parameterized over `KeyValueStore` — the same class backs both the
 * production path (given a `RedisKeyValueStore`) and tests (given an `InMemoryKeyValueStore`), so
 * the JSON-encoding/validation/key-naming logic isn't duplicated between a "real" and a "fake"
 * repository class. Every store call is wrapped so ANY backend failure (real Redis outage, a test
 * double throwing) surfaces as a typed `RepositoryError`, never a raw/unknown exception.
 */
export class KeyValueRoomStateRepository implements RoomStateRepository {
  constructor(private readonly store: KeyValueStore, private readonly defaultTtlSeconds: number = DEFAULT_ROOM_TTL_SECONDS) {}

  async save(room: RoomState, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    const json = JSON.stringify(room);
    try {
      await this.store.set(roomStateKey(room.roomId), json, ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', `Failed to save RoomState(${room.roomId})`);
    }
  }

  async load(roomId: string): Promise<RoomState | null> {
    let raw: string | null;
    try {
      raw = await this.store.get(roomStateKey(roomId));
    } catch (cause) {
      throw wrapStoreError(cause, 'READ_FAILURE', `Failed to load RoomState(${roomId})`);
    }
    if (raw === null) return null;
    return parseStoredJson(raw, RoomStateSchema, `RoomState(${roomId})`) as RoomState;
  }

  async delete(roomId: string): Promise<void> {
    try {
      await this.store.del(roomStateKey(roomId));
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', `Failed to delete RoomState(${roomId})`);
    }
  }

  async refreshTtl(roomId: string, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    try {
      await this.store.expire(roomStateKey(roomId), ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', `Failed to refresh TTL for RoomState(${roomId})`);
    }
  }
}
