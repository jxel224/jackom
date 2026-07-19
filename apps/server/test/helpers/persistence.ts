import type { Deps } from '../../src/types/deps.js';
import type { KeyValueStore } from '../../src/persistence/kv-store.js';
import { InMemoryKeyValueStore } from '../../src/persistence/in-memory-kv-store.js';
import { KeyValueRoomStateRepository } from '../../src/persistence/room-state-repo.js';
import { KeyValueRoomPrivateStateRepository } from '../../src/persistence/room-private-state-repo.js';
import { KeyValueRoomLookupRepository } from '../../src/persistence/room-lookup-repo.js';
import { KeyValueSessionRepository } from '../../src/persistence/session-repo.js';
import type { RoomLogEvent, RoomLogger } from '../../src/persistence/logging.js';

export function buildRepos(deps: Deps, ttlSeconds = 3600) {
  const store = new InMemoryKeyValueStore(deps.now);
  return {
    store,
    roomStateRepo: new KeyValueRoomStateRepository(store, ttlSeconds),
    roomPrivateStateRepo: new KeyValueRoomPrivateStateRepository(store, ttlSeconds),
    roomLookupRepo: new KeyValueRoomLookupRepository(store, ttlSeconds),
    sessionRepo: new KeyValueSessionRepository(store, ttlSeconds),
  };
}

/**
 * Wraps a real `KeyValueStore` and can be configured to throw on specific methods/keys, to
 * simulate Redis read/write failures deterministically without needing an actual Redis outage.
 */
export class FailingKeyValueStore implements KeyValueStore {
  failGetForKeys = new Set<string>();
  failSetForKeys = new Set<string>();

  constructor(private readonly inner: KeyValueStore) {}

  async get(key: string): Promise<string | null> {
    if (this.failGetForKeys.has(key)) throw new Error(`simulated read failure for ${key}`);
    return this.inner.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.failSetForKeys.has(key)) throw new Error(`simulated write failure for ${key}`);
    return this.inner.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    return this.inner.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.inner.exists(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    return this.inner.expire(key, ttlSeconds);
  }
}

export function collectingLogger(): { logger: RoomLogger; entries: RoomLogEvent[] } {
  const entries: RoomLogEvent[] = [];
  return { logger: (entry) => entries.push(entry), entries };
}
