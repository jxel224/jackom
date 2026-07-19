/**
 * Simple sliding-window rate limiter, one instance per socket. Driven entirely by an injected
 * clock (never `Date.now()` internally) so gateway tests stay deterministic, matching the same
 * dependency-injection discipline used throughout the FSM (ARCHITECTURE.md/Step 2).
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxEvents: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  /** Returns true if this call is within the limit (and records it); false if it should be rejected. */
  tryConsume(): boolean {
    const cutoff = this.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
    if (this.timestamps.length >= this.maxEvents) {
      return false;
    }
    this.timestamps.push(this.now());
    return true;
  }
}
