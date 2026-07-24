/**
 * A tiny, single-instance, in-memory idempotency cache (Development Step 7A). When a client
 * supplies a `requestId` with a join request, a retried request (same `roomCode` + `requestId`)
 * replays the ORIGINAL response instead of registering a second player — this is what makes an
 * accidental double-submit (double-click, a client retry after a dropped response) safe without
 * needing a new server-side concept beyond "remember this result for a little while."
 *
 * Single-instance only: this is a plain in-memory `Map`, not backed by Redis. Fine for the current
 * one-process deployment model (ARCHITECTURE.md §7.1); would need to move to a shared store if the
 * server ever runs as multiple instances behind a load balancer — not done here since nothing else
 * in this codebase does distributed coordination yet either (§7.1 explicitly defers that).
 */
export class IdempotencyCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  size(): number {
    return this.entries.size;
  }
}
