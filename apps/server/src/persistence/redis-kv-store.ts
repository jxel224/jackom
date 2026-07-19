import type { Redis } from 'ioredis';
import type { KeyValueStore } from './kv-store.js';
import { RepositoryError } from './errors.js';

/**
 * Production `KeyValueStore`, backed by ioredis. This is the ONLY file in the persistence layer
 * that imports ioredis — swapping Redis clients (or Redis itself) later only touches this file.
 *
 * ioredis was chosen over the official `redis` package for this project because:
 *  - it has first-class TypeScript types out of the box (no separate @types package),
 *  - its promise-based API needs no callback/promise interop layer,
 *  - it has built-in reconnection/retry behavior sensible for a long-lived room-actor process,
 *  - it's a mature, widely-used client with a stable API surface for the handful of primitives
 *    (GET/SET with EX/DEL/EXISTS/EXPIRE) this project actually needs.
 */
export class RedisKeyValueStore implements KeyValueStore {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (cause) {
      throw new RepositoryError('READ_FAILURE', `Redis GET failed for key "${key}"`, cause);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds !== undefined) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (cause) {
      throw new RepositoryError('WRITE_FAILURE', `Redis SET failed for key "${key}"`, cause);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (cause) {
      throw new RepositoryError('WRITE_FAILURE', `Redis DEL failed for key "${key}"`, cause);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const count = await this.client.exists(key);
      return count > 0;
    } catch (cause) {
      throw new RepositoryError('READ_FAILURE', `Redis EXISTS failed for key "${key}"`, cause);
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (cause) {
      throw new RepositoryError('WRITE_FAILURE', `Redis EXPIRE failed for key "${key}"`, cause);
    }
  }
}
