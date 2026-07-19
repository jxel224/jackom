import type { RoomPrivateState } from '../types/room-state.js';
import type { KeyValueStore } from './kv-store.js';
import { RoomPrivateStateSchema } from './schemas.js';
import { parseStoredJson } from './validate.js';
import { roomPrivateStateKey } from './keys.js';
import { DEFAULT_ROOM_TTL_SECONDS } from './config.js';
import { wrapStoreError } from './errors.js';

export interface RoomPrivateStateRepository {
  save(priv: RoomPrivateState, ttlSeconds?: number): Promise<void>;
  load(roomId: string): Promise<RoomPrivateState | null>;
  delete(roomId: string): Promise<void>;
  refreshTtl(roomId: string, ttlSeconds?: number): Promise<void>;
}

export class KeyValueRoomPrivateStateRepository implements RoomPrivateStateRepository {
  constructor(private readonly store: KeyValueStore, private readonly defaultTtlSeconds: number = DEFAULT_ROOM_TTL_SECONDS) {}

  async save(priv: RoomPrivateState, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    const json = JSON.stringify(priv);
    try {
      await this.store.set(roomPrivateStateKey(priv.roomId), json, ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', `Failed to save RoomPrivateState(${priv.roomId})`);
    }
  }

  async load(roomId: string): Promise<RoomPrivateState | null> {
    let raw: string | null;
    try {
      raw = await this.store.get(roomPrivateStateKey(roomId));
    } catch (cause) {
      throw wrapStoreError(cause, 'READ_FAILURE', `Failed to load RoomPrivateState(${roomId})`);
    }
    if (raw === null) return null;
    // description deliberately omits any content — this string can appear in a thrown error message.
    return parseStoredJson(raw, RoomPrivateStateSchema, `RoomPrivateState(${roomId})`) as RoomPrivateState;
  }

  async delete(roomId: string): Promise<void> {
    try {
      await this.store.del(roomPrivateStateKey(roomId));
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', `Failed to delete RoomPrivateState(${roomId})`);
    }
  }

  async refreshTtl(roomId: string, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    try {
      await this.store.expire(roomPrivateStateKey(roomId), ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', `Failed to refresh TTL for RoomPrivateState(${roomId})`);
    }
  }
}
