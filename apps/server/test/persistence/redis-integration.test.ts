import { describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { createTestDeps } from '../helpers/test-deps.js';
import { RedisKeyValueStore } from '../../src/persistence/redis-kv-store.js';
import { KeyValueRoomStateRepository } from '../../src/persistence/room-state-repo.js';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { createRoom } from '../../src/fsm/room-lifecycle.js';

/**
 * Optional integration test against a REAL Redis instance. Skipped entirely (not failed) when no
 * Redis is reachable, so the main test suite never depends on a locally running server. Point it
 * at a real instance via REDIS_URL (defaults to redis://127.0.0.1:6379) to actually exercise it.
 *
 * The connectivity probe runs at module-load time (top-level await) — `describe.skipIf` evaluates
 * its condition synchronously during test collection, before any `beforeAll` hook would run, so
 * the check has to happen here rather than in a hook.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function probeRedis(): Promise<Redis | null> {
  const candidate = new Redis(REDIS_URL, { lazyConnect: true, retryStrategy: () => null, connectTimeout: 500 });
  candidate.on('error', () => {}); // expected when no local Redis is running — avoid noisy unhandled-error stderr output
  try {
    await candidate.connect();
    await candidate.ping();
    return candidate;
  } catch {
    candidate.disconnect();
    return null;
  }
}

const client = await probeRedis();

describe.skipIf(client === null)('Redis integration (real server)', () => {
  it('saves and loads a real RoomState through an actual Redis connection', async () => {
    if (!client) return;
    const store = new RedisKeyValueStore(client);
    const repo = new KeyValueRoomStateRepository(store, 30);
    const deps = createTestDeps(199);
    const { room } = createRoom(createDefaultConfig(), deps);

    await repo.save(room);
    const loaded = await repo.load(room.roomId);
    expect(loaded).toEqual(room);

    await repo.delete(room.roomId);
    expect(await repo.load(room.roomId)).toBeNull();
    await client.quit();
  });
});
