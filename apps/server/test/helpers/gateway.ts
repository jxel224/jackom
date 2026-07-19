import { WebSocket } from 'ws';
import type { Deps } from '../../src/types/deps.js';
import { createTestDeps } from './test-deps.js';
import { buildRepos } from './persistence.js';
import { RoomActorManager } from '../../src/actors/room-actor-manager.js';
import { GatewayServer, type GatewayOptions } from '../../src/gateway/gateway-server.js';
import type { WireMessage } from '../../src/gateway/types.js';

export interface TestGatewaySetup {
  server: GatewayServer;
  port: number;
  manager: RoomActorManager;
  repos: ReturnType<typeof buildRepos>;
  deps: Deps;
  close(): Promise<void>;
}

export async function startTestGateway(options: GatewayOptions = {}, depsOverride?: Deps, seed = 1): Promise<TestGatewaySetup> {
  const deps = depsOverride ?? createTestDeps(seed);
  const repos = buildRepos(deps);
  const manager = new RoomActorManager({
    fsmDeps: deps,
    roomStateRepo: repos.roomStateRepo,
    roomPrivateStateRepo: repos.roomPrivateStateRepo,
    roomLookupRepo: repos.roomLookupRepo,
    sessionRepo: repos.sessionRepo,
  });
  const server = new GatewayServer(
    { roomActorManager: manager, roomLookupRepo: repos.roomLookupRepo, sessionRepo: repos.sessionRepo, fsmDeps: deps },
    { authTimeoutMs: 3000, heartbeatIntervalMs: 60_000, ...options },
  );
  const port = await server.listen(0);
  return {
    server,
    port,
    manager,
    repos,
    deps,
    close: () => server.close(),
  };
}

/**
 * Every message a socket ever receives, from the moment tracking starts, funnels through ONE
 * `ws.on('message', ...)` listener into either a waiting `nextMessage()` call or this inbox —
 * never both, and never lost. This matters because a server can legitimately `send()` two
 * messages back-to-back (e.g. an ack immediately followed by a broadcast view); if each
 * `nextMessage()` call instead attached and removed its own one-shot listener, a message arriving
 * in the gap between one call resolving and the next call's `await` resuming to attach a new
 * listener would vanish with nothing subscribed to receive it. Centralizing into one persistent
 * listener + inbox removes that race entirely.
 */
interface Waiter {
  predicate?: (m: WireMessage) => boolean;
  resolve: (m: WireMessage) => void;
}

const inboxes = new WeakMap<WebSocket, WireMessage[]>();
const waiters = new WeakMap<WebSocket, Waiter[]>();

function ensureTracking(ws: WebSocket): void {
  if (inboxes.has(ws)) return;
  inboxes.set(ws, []);
  waiters.set(ws, []);
  ws.on('message', (data: WebSocket.RawData) => {
    let msg: WireMessage;
    try {
      msg = JSON.parse(data.toString()) as WireMessage;
    } catch {
      return;
    }
    const pending = waiters.get(ws)!;
    const idx = pending.findIndex((w) => !w.predicate || w.predicate(msg));
    if (idx !== -1) {
      const [waiter] = pending.splice(idx, 1);
      waiter!.resolve(msg);
    } else {
      inboxes.get(ws)!.push(msg);
    }
  });
}

/**
 * `kind` uses the readable 'host'/'player' vocabulary throughout the test suite, but the actual
 * wire path is `/host/{roomCode}` or `/play/{roomCode}` (ARCHITECTURE.md Step 4 connection paths)
 * — this is the one place that translates between the two.
 */
export function connectClient(port: number, kind: 'host' | 'player', roomCode: string): WebSocket {
  const pathSegment = kind === 'host' ? 'host' : 'play';
  const ws = new WebSocket(`ws://127.0.0.1:${port}/${pathSegment}/${roomCode}`);
  ensureTracking(ws);
  return ws;
}

export function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

export interface CloseInfo {
  code: number;
  reason: string;
}

export function waitForClose(ws: WebSocket): Promise<CloseInfo> {
  return new Promise((resolve) => {
    ws.once('close', (code: number, reasonBuf: Buffer) => resolve({ code, reason: reasonBuf.toString() }));
  });
}

/** Also resolves (with no unexpected-response info) if the connection is rejected at the HTTP-upgrade stage. */
export function waitForOpenOrReject(ws: WebSocket): Promise<{ opened: boolean; statusCode?: number }> {
  return new Promise((resolve) => {
    ws.once('open', () => resolve({ opened: true }));
    ws.once('unexpected-response', (_req, res) => resolve({ opened: false, statusCode: res.statusCode }));
    ws.once('error', () => resolve({ opened: false }));
  });
}

/** Returns the next message matching `predicate` — checking already-buffered messages first, then waiting for a new one. */
export function nextMessage(ws: WebSocket, predicate?: (m: WireMessage) => boolean, timeoutMs = 3000): Promise<WireMessage> {
  ensureTracking(ws);
  const inbox = inboxes.get(ws)!;
  const bufferedIndex = inbox.findIndex((m) => !predicate || predicate(m));
  if (bufferedIndex !== -1) {
    const [msg] = inbox.splice(bufferedIndex, 1);
    return Promise.resolve(msg!);
  }

  return new Promise((resolve, reject) => {
    const pending = waiters.get(ws)!;
    const timer = setTimeout(() => {
      const idx = pending.indexOf(waiter);
      if (idx !== -1) pending.splice(idx, 1);
      reject(new Error(`timeout waiting for message${predicate ? ' matching predicate' : ''}`));
    }, timeoutMs);
    const waiter: Waiter = {
      predicate,
      resolve: (m) => {
        clearTimeout(timer);
        resolve(m);
      },
    };
    pending.push(waiter);
  });
}

/** Waits `windowMs`, then returns every message that landed in the inbox during that time (and wasn't claimed by a concurrent `nextMessage`). */
export async function collectMessages(ws: WebSocket, windowMs = 200): Promise<WireMessage[]> {
  ensureTracking(ws);
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  const inbox = inboxes.get(ws)!;
  return inbox.splice(0, inbox.length);
}

export function send(ws: WebSocket, message: { type: string; requestId?: string | null; payload?: unknown }): void {
  ws.send(JSON.stringify({ requestId: null, payload: {}, ...message }));
}

export function sendRaw(ws: WebSocket, raw: string): void {
  ws.send(raw);
}

export interface AuthedHost {
  ws: WebSocket;
}

/** Connects a host socket and completes authentication, consuming the ack + initial view:tv. */
export async function authenticateHost(port: number, roomCode: string, hostSessionToken: string): Promise<AuthedHost> {
  const ws = connectClient(port, 'host', roomCode);
  await waitForOpen(ws);
  send(ws, { type: 'host:reconnect', payload: { hostSessionToken } });
  await nextMessage(ws, (m) => m.type === 'host:authenticated');
  await nextMessage(ws, (m) => m.type === 'view:tv');
  return { ws };
}

export interface AuthedPlayer {
  ws: WebSocket;
  playerId: string;
  sessionToken: string;
}

/** Connects a player socket and completes a brand-new join, consuming the ack + initial view:player. */
export async function joinAsPlayer(port: number, roomCode: string, name: string, avatarId = 'avatar-1'): Promise<AuthedPlayer> {
  const ws = connectClient(port, 'player', roomCode);
  await waitForOpen(ws);
  send(ws, { type: 'player:join', payload: { name, avatarId } });
  const joined = await nextMessage(ws, (m) => m.type === 'player:joined');
  const { playerId, sessionToken } = joined.payload as { playerId: string; sessionToken: string };
  await nextMessage(ws, (m) => m.type === 'view:player');
  return { ws, playerId, sessionToken };
}
