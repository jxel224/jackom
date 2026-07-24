import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeSocket } from '../../../lib/realtime/realtime-socket';
import type { ConnectionState } from '../../../lib/realtime/types';

/**
 * Timing-sensitive `RealtimeSocket` behavior (backoff growth/cap/jitter/reset, offline/online
 * handling) using a FAKE WebSocket implementation (injected via the test-only `webSocketImpl`
 * option) plus `vi.useFakeTimers()`. Deliberately not a real socket/server here — these tests need
 * exact control over event timing, which a real network round trip can't reliably give.
 */

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 10_000;
const BACKOFF_MULTIPLIER = 1.8;
const JITTER_RATIO = 0.2;

function delayBounds(attempt: number): { min: number; max: number } {
  const raw = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt));
  const jitter = raw * JITTER_RATIO;
  return { min: Math.max(0, raw - jitter), max: raw + jitter };
}

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, cb: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  removeEventListener(type: string, cb: Listener): void {
    this.listeners.get(type)?.delete(cb);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', { code, reason });
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch('open', {});
  }

  emitMessage(envelope: { type: string; requestId?: string | null; payload: unknown }): void {
    this.dispatch('message', { data: JSON.stringify(envelope) });
  }

  emitAbnormalClose(code = 1006): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', { code, reason: '' });
  }

  private dispatch(type: string, event: unknown): void {
    for (const cb of this.listeners.get(type) ?? []) cb(event);
  }
}

const wsImpl = FakeWebSocket as unknown as typeof WebSocket;

interface StateChange {
  state: ConnectionState;
  error: { code: string; message: string } | null;
}

let sockets: RealtimeSocket[] = [];

function makeSocket(states: StateChange[], maxConsecutiveFailures?: number): RealtimeSocket {
  const socket = new RealtimeSocket({
    wsBaseUrl: 'ws://fake.invalid',
    kind: 'host',
    roomCode: 'ABCD',
    webSocketImpl: wsImpl,
    maxConsecutiveFailures,
    buildAuthMessage: () => ({ type: 'host:reconnect', payload: { hostSessionToken: 'tok' } }),
    onStateChange: (state, error) => states.push({ state, error }),
    onEnvelope: () => {},
  });
  sockets.push(socket);
  return socket;
}

function latestSocket(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
});

afterEach(() => {
  for (const s of sockets) s.close();
  sockets = [];
  vi.useRealTimers();
});

describe('RealtimeSocket — backoff, cap, jitter, reset', () => {
  it('grows the reconnect delay within the expected bounds for each consecutive failed attempt', async () => {
    const states: StateChange[] = [];
    makeSocket(states).connect();
    expect(FakeWebSocket.instances).toHaveLength(1);

    latestSocket().emitAbnormalClose();
    const attempt0 = delayBounds(0);
    await vi.advanceTimersByTimeAsync(Math.floor(attempt0.min) - 5);
    expect(FakeWebSocket.instances).toHaveLength(1); // not yet — under the minimum possible delay
    await vi.advanceTimersByTimeAsync(Math.ceil(attempt0.max) + 5 - (Math.floor(attempt0.min) - 5));
    expect(FakeWebSocket.instances).toHaveLength(2); // by now — past the maximum possible delay

    latestSocket().emitAbnormalClose();
    const attempt1 = delayBounds(1);
    await vi.advanceTimersByTimeAsync(Math.floor(attempt1.min) - 5);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(Math.ceil(attempt1.max) + 5 - (Math.floor(attempt1.min) - 5));
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('caps the reconnect delay at MAX_DELAY_MS instead of growing forever', async () => {
    const states: StateChange[] = [];
    makeSocket(states, 100).connect();

    // Fail enough times in a row that, uncapped, the delay would already exceed the cap.
    for (let i = 0; i < 8; i++) {
      latestSocket().emitAbnormalClose();
      await vi.advanceTimersByTimeAsync(MAX_DELAY_MS * 1.3);
    }
    expect(FakeWebSocket.instances.length).toBe(9);

    latestSocket().emitAbnormalClose();
    // Comfortably under an uncapped attempt-8 delay (500 * 1.8^8 ≈ 43,600ms) but just past the cap.
    await vi.advanceTimersByTimeAsync(MAX_DELAY_MS * 1.3);
    expect(FakeWebSocket.instances.length).toBe(10);
  });

  it('a successful connection resets the retry count for the NEXT disconnect', async () => {
    const states: StateChange[] = [];
    makeSocket(states).connect();

    // Fail twice to grow the attempt counter.
    latestSocket().emitAbnormalClose();
    await vi.advanceTimersByTimeAsync(delayBounds(0).max + 10);
    latestSocket().emitAbnormalClose();
    await vi.advanceTimersByTimeAsync(delayBounds(1).max + 10);
    expect(FakeWebSocket.instances).toHaveLength(3);

    // Now succeed.
    const successSocket = latestSocket();
    successSocket.emitOpen();
    successSocket.emitMessage({ type: 'host:authenticated', requestId: null, payload: { roomId: 'room-1' } });
    expect(states.some((s) => s.state === 'connected')).toBe(true);

    // Disconnect again — the next delay should be back at attempt-0 bounds, not continuing to grow.
    successSocket.emitAbnormalClose();
    const resetBounds = delayBounds(0);
    await vi.advanceTimersByTimeAsync(Math.ceil(resetBounds.max) + 10);
    expect(FakeWebSocket.instances).toHaveLength(4); // reconnected well within attempt-0 bounds
  });

  it('stops automatically reconnecting after maxConsecutiveFailures and reports a safe Arabic failure message', async () => {
    const states: StateChange[] = [];
    const maxFailures = 3;
    makeSocket(states, maxFailures).connect();

    // Each of these closes still has attempt < maxFailures, so each one schedules another attempt.
    for (let i = 0; i < maxFailures; i++) {
      latestSocket().emitAbnormalClose();
      await vi.advanceTimersByTimeAsync(MAX_DELAY_MS);
    }
    expect(FakeWebSocket.instances).toHaveLength(1 + maxFailures);
    expect(states.some((s) => s.state === 'failed')).toBe(false);

    // This close's attempt has now reached maxFailures — terminal 'failed', no new attempt scheduled.
    latestSocket().emitAbnormalClose();
    expect(states.some((s) => s.state === 'failed')).toBe(true);
    const failed = states.find((s) => s.state === 'failed')!;
    expect(failed.error?.message).toBe('تعذر الاتصال بالخادم.');

    const countAtFailure = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(MAX_DELAY_MS * 2);
    expect(FakeWebSocket.instances.length).toBe(countAtFailure); // no further attempts
  });
});

describe('RealtimeSocket — offline/online handling', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  let target: EventTarget;
  let onLine: boolean;

  beforeEach(() => {
    target = new EventTarget();
    onLine = true;
    (globalThis as Record<string, unknown>).window = {
      addEventListener: (type: string, cb: EventListener) => target.addEventListener(type, cb),
      removeEventListener: (type: string, cb: EventListener) => target.removeEventListener(type, cb),
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { get onLine() { return onLine; } },
      configurable: true,
    });
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).window = originalWindow;
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  it('going offline while reconnecting shows a clear offline state instead of burning attempts', async () => {
    const states: StateChange[] = [];
    makeSocket(states).connect();
    latestSocket().emitAbnormalClose();

    onLine = false;
    target.dispatchEvent(new Event('offline'));

    expect(states.some((s) => s.state === 'disconnected' && s.error?.code === 'OFFLINE')).toBe(true);
    const countWhileOffline = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(MAX_DELAY_MS * 2);
    expect(FakeWebSocket.instances.length).toBe(countWhileOffline); // never attempted while offline
  });

  it('coming back online resumes connecting immediately, without waiting for a backoff timer', async () => {
    const states: StateChange[] = [];
    makeSocket(states).connect();
    latestSocket().emitAbnormalClose();

    onLine = false;
    target.dispatchEvent(new Event('offline'));
    const countWhileOffline = FakeWebSocket.instances.length;

    onLine = true;
    target.dispatchEvent(new Event('online'));

    expect(FakeWebSocket.instances.length).toBe(countWhileOffline + 1);
  });
});
