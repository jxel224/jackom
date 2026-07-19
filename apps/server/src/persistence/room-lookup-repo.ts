import type { KeyValueStore } from './kv-store.js';
import { roomCodeKey } from './keys.js';
import { DEFAULT_ROOM_TTL_SECONDS } from './config.js';
import { wrapStoreError } from './errors.js';

export interface RoomLookupRepository {
  setRoomCode(roomCode: string, roomId: string, ttlSeconds?: number): Promise<void>;
  resolveRoomCode(roomCode: string): Promise<string | null>;
  deleteRoomCode(roomCode: string): Promise<void>;
  refreshTtl(roomCode: string, ttlSeconds?: number): Promise<void>;
}

export class KeyValueRoomLookupRepository implements RoomLookupRepository {
  constructor(private readonly store: KeyValueStore, private readonly defaultTtlSeconds: number = DEFAULT_ROOM_TTL_SECONDS) {}

  async setRoomCode(roomCode: string, roomId: string, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    try {
      await this.store.set(roomCodeKey(roomCode), roomId, ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', `Failed to set roomCode lookup for ${roomCode}`);
    }
  }

  async resolveRoomCode(roomCode: string): Promise<string | null> {
    try {
      return await this.store.get(roomCodeKey(roomCode));
    } catch (cause) {
      throw wrapStoreError(cause, 'READ_FAILURE', `Failed to resolve roomCode ${roomCode}`);
    }
  }

  async deleteRoomCode(roomCode: string): Promise<void> {
    try {
      await this.store.del(roomCodeKey(roomCode));
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', `Failed to delete roomCode lookup for ${roomCode}`);
    }
  }

  async refreshTtl(roomCode: string, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    try {
      await this.store.expire(roomCodeKey(roomCode), ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', `Failed to refresh TTL for roomCode ${roomCode}`);
    }
  }
}
