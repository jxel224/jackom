/**
 * The ONLY abstraction the repository layer depends on — repositories never import ioredis (or
 * any Redis library) directly, so the FSM and repository logic stay unaware that Redis exists.
 * Two implementations exist: `RedisKeyValueStore` (production) and `InMemoryKeyValueStore` (tests).
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  /** Sets the value; if `ttlSeconds` is provided, the key expires after that many seconds. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Refreshes the TTL of an existing key without rewriting its value. No-op if the key is absent. */
  expire(key: string, ttlSeconds: number): Promise<void>;
}
