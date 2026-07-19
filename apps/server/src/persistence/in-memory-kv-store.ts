import type { KeyValueStore } from './kv-store.js';

interface Entry {
  value: string;
  expiresAt: number | null; // epoch ms, or null = no expiry
}

/**
 * In-memory `KeyValueStore` for tests — no real Redis server required for the main test suite.
 * TTL is simulated against an injected clock (`now`), not real wall-clock time, so tests can
 * deterministically "advance time" without sleeping.
 */
export class InMemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= this.now();
  }

  private read(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.read(key);
    return entry ? entry.value : null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds !== undefined ? this.now() + ttlSeconds * 1000 : null;
    this.entries.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.read(key) !== undefined;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.read(key);
    if (!entry) return;
    entry.expiresAt = this.now() + ttlSeconds * 1000;
  }

  /** Test-only escape hatch: how many live (non-expired) keys currently exist. */
  size(): number {
    let count = 0;
    for (const key of this.entries.keys()) {
      if (this.read(key)) count += 1;
    }
    return count;
  }
}
