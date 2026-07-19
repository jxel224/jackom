import { describe, expect, it } from 'vitest';
import { createTestDeps } from '../helpers/test-deps.js';
import { InMemoryKeyValueStore } from '../../src/persistence/in-memory-kv-store.js';

describe('InMemoryKeyValueStore', () => {
  it('get/set/del/exists round-trip', async () => {
    const deps = createTestDeps();
    const store = new InMemoryKeyValueStore(deps.now);

    expect(await store.get('a')).toBeNull();
    await store.set('a', 'hello');
    expect(await store.get('a')).toBe('hello');
    expect(await store.exists('a')).toBe(true);
    await store.del('a');
    expect(await store.get('a')).toBeNull();
    expect(await store.exists('a')).toBe(false);
  });

  it('a TTL-set key expires against the injected clock, not real time', async () => {
    let clock = 1_000_000;
    const store = new InMemoryKeyValueStore(() => clock);

    await store.set('a', 'hello', 10); // 10 seconds
    expect(await store.get('a')).toBe('hello');

    clock += 5_000; // 5s later — still alive
    expect(await store.get('a')).toBe('hello');

    clock += 6_000; // 11s total — expired
    expect(await store.get('a')).toBeNull();
    expect(await store.exists('a')).toBe(false);
  });

  it('expire() refreshes an existing key\'s TTL without touching its value', async () => {
    let clock = 0;
    const store = new InMemoryKeyValueStore(() => clock);
    await store.set('a', 'v1', 5);

    clock += 4_000; // about to expire
    await store.expire('a', 10); // refreshed for another 10s from now
    clock += 8_000; // would have expired under the OLD ttl, not under the refreshed one
    expect(await store.get('a')).toBe('v1');
  });

  it('expire() on a missing key is a no-op', async () => {
    const store = new InMemoryKeyValueStore(() => 0);
    await expect(store.expire('missing', 10)).resolves.toBeUndefined();
  });
});
