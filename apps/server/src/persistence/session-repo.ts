import { z } from 'zod';
import type { KeyValueStore } from './kv-store.js';
import { hostSessionKey, playerSessionKey } from './keys.js';
import { parseStoredJson } from './validate.js';
import { DEFAULT_ROOM_TTL_SECONDS } from './config.js';
import { wrapStoreError } from './errors.js';

export interface PlayerSessionRecord {
  roomId: string;
  playerId: string;
}

export interface HostSessionRecord {
  roomId: string;
}

const PlayerSessionSchema = z.object({ roomId: z.string(), playerId: z.string() });
const HostSessionRecordSchema = z.object({ roomId: z.string() });

export interface SessionRepository {
  setPlayerSession(sessionToken: string, record: PlayerSessionRecord, ttlSeconds?: number): Promise<void>;
  resolvePlayerSession(sessionToken: string): Promise<PlayerSessionRecord | null>;
  deletePlayerSession(sessionToken: string): Promise<void>;
  refreshPlayerSessionTtl(sessionToken: string, ttlSeconds?: number): Promise<void>;

  setHostSession(hostSessionToken: string, record: HostSessionRecord, ttlSeconds?: number): Promise<void>;
  resolveHostSession(hostSessionToken: string): Promise<HostSessionRecord | null>;
  deleteHostSession(hostSessionToken: string): Promise<void>;
  refreshHostSessionTtl(hostSessionToken: string, ttlSeconds?: number): Promise<void>;
}

/** Session tokens are never included in any error message here — only the (non-secret) key name shape. */
export class KeyValueSessionRepository implements SessionRepository {
  constructor(private readonly store: KeyValueStore, private readonly defaultTtlSeconds: number = DEFAULT_ROOM_TTL_SECONDS) {}

  async setPlayerSession(sessionToken: string, record: PlayerSessionRecord, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    try {
      await this.store.set(playerSessionKey(sessionToken), JSON.stringify(record), ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', 'Failed to set player session');
    }
  }

  async resolvePlayerSession(sessionToken: string): Promise<PlayerSessionRecord | null> {
    let raw: string | null;
    try {
      raw = await this.store.get(playerSessionKey(sessionToken));
    } catch (cause) {
      throw wrapStoreError(cause, 'READ_FAILURE', 'Failed to resolve player session');
    }
    if (raw === null) return null;
    return parseStoredJson(raw, PlayerSessionSchema, 'PlayerSessionRecord');
  }

  async deletePlayerSession(sessionToken: string): Promise<void> {
    try {
      await this.store.del(playerSessionKey(sessionToken));
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', 'Failed to delete player session');
    }
  }

  async refreshPlayerSessionTtl(sessionToken: string, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    try {
      await this.store.expire(playerSessionKey(sessionToken), ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', 'Failed to refresh player session TTL');
    }
  }

  async setHostSession(hostSessionToken: string, record: HostSessionRecord, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    try {
      await this.store.set(hostSessionKey(hostSessionToken), JSON.stringify(record), ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', 'Failed to set host session');
    }
  }

  async resolveHostSession(hostSessionToken: string): Promise<HostSessionRecord | null> {
    let raw: string | null;
    try {
      raw = await this.store.get(hostSessionKey(hostSessionToken));
    } catch (cause) {
      throw wrapStoreError(cause, 'READ_FAILURE', 'Failed to resolve host session');
    }
    if (raw === null) return null;
    return parseStoredJson(raw, HostSessionRecordSchema, 'HostSessionRecord');
  }

  async deleteHostSession(hostSessionToken: string): Promise<void> {
    try {
      await this.store.del(hostSessionKey(hostSessionToken));
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', 'Failed to delete host session');
    }
  }

  async refreshHostSessionTtl(hostSessionToken: string, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    try {
      await this.store.expire(hostSessionKey(hostSessionToken), ttlSeconds);
    } catch (cause) {
      throw wrapStoreError(cause, 'WRITE_FAILURE', 'Failed to refresh host session TTL');
    }
  }
}
