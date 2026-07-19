import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import type { EventSender, InboundEvent } from '../shared.js';
import type { Deps } from '../types/deps.js';
import type { RoomActorManager } from '../actors/room-actor-manager.js';
import type { RoomLookupRepository } from '../persistence/room-lookup-repo.js';
import type { SessionRepository } from '../persistence/session-repo.js';
import { RoomConsistencyError } from '../persistence/errors.js';
import { noopRoomLogger, type RoomLogger } from '../persistence/logging.js';
import { DEFAULT_ROOM_TTL_SECONDS } from '../persistence/config.js';
import { joinPlayer, leavePlayer } from '../fsm/room-lifecycle.js';
import { buildTvView } from '../views/build-tv-view.js';
import { buildPlayerView } from '../views/build-player-view.js';
import { buildPrivatePlayerView } from '../views/build-private-player-view.js';
import { RoomSocketRegistry } from './connection-registry.js';
import { RateLimiter } from './rate-limiter.js';
import {
  FSM_EVENT_PAYLOAD_SCHEMAS,
  GATEWAY_LIFECYCLE_EVENT_TYPES,
  HostReconnectPayloadSchema,
  PlayerJoinPayloadSchema,
  PlayerLeavePayloadSchema,
  PlayerReconnectPayloadSchema,
  SYSTEM_ONLY_EVENT_TYPES,
  WireMessageSchema,
} from './schemas.js';
import type { ConnectionKind, GatewayErrorCode, WireMessage } from './types.js';

/**
 * The WebSocket gateway. Per ARCHITECTURE.md Step 4, this layer may ONLY: authenticate the
 * connection, validate wire message shape, attach the authenticated sender identity, dispatch to
 * the correct RoomActor, and build/send the correct client views. It never decides a game outcome
 * or a state transition itself — every mutation goes through `RoomActor.dispatch()` /
 * `RoomActor.runLifecycle()`, which call the existing pure FSM (Step 2) unchanged.
 */

export interface GatewayDeps {
  roomActorManager: RoomActorManager;
  roomLookupRepo: RoomLookupRepository;
  sessionRepo: SessionRepository;
  fsmDeps: Deps;
}

export interface GatewayOptions {
  maxPayloadBytes?: number;
  rateLimitMaxMessages?: number;
  rateLimitWindowMs?: number;
  maxViolations?: number;
  heartbeatIntervalMs?: number;
  authTimeoutMs?: number;
  ttlSeconds?: number;
  logger?: RoomLogger;
}

interface ResolvedOptions {
  maxPayloadBytes: number;
  rateLimitMaxMessages: number;
  rateLimitWindowMs: number;
  maxViolations: number;
  heartbeatIntervalMs: number;
  authTimeoutMs: number;
  ttlSeconds: number;
}

interface SocketMeta {
  kind: ConnectionKind;
  roomId: string;
  roomCode: string;
  authenticated: boolean;
  playerId?: string;
  /** Server-side only — never re-sent to the client after the initial join/reconnect ack. Needed to clean up the session record on explicit leave. */
  sessionToken?: string;
  privateInfoSent: boolean;
  malformedCount: number;
  rateLimiter: RateLimiter;
  isAlive: boolean;
  replaced: boolean;
  authTimer: ReturnType<typeof setTimeout> | null;
}

interface PendingConnectionInfo {
  kind: ConnectionKind;
  roomCode: string;
  roomId: string;
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  maxPayloadBytes: 16 * 1024,
  rateLimitMaxMessages: 20,
  rateLimitWindowMs: 1000,
  maxViolations: 5,
  heartbeatIntervalMs: 30_000,
  authTimeoutMs: 10_000,
  ttlSeconds: DEFAULT_ROOM_TTL_SECONDS,
};

export class GatewayServer {
  private readonly options: ResolvedOptions;
  private readonly logger: RoomLogger;
  private readonly registry = new RoomSocketRegistry();
  private readonly sockets = new Map<WebSocket, SocketMeta>();
  private readonly pendingConnectionInfo = new WeakMap<IncomingMessage, PendingConnectionInfo>();
  private wss: WebSocketServer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: GatewayDeps, options: GatewayOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = options.logger ?? noopRoomLogger;
  }

  /** Starts listening on `port` (0 = ephemeral) and returns the actually-bound port. */
  listen(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        port,
        host: '127.0.0.1',
        maxPayload: this.options.maxPayloadBytes * 4, // hard protocol-level backstop; our own check fires first
        verifyClient: this.verifyClient,
      });
      this.wss = wss;
      wss.on('connection', (ws: WebSocket, request: IncomingMessage) => this.handleConnection(ws, request));
      wss.once('listening', () => {
        const address = wss.address();
        const boundPort = typeof address === 'object' && address !== null ? address.port : port;
        this.startHeartbeat();
        resolve(boundPort);
      });
      wss.once('error', reject);
    });
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const ws of this.sockets.keys()) {
      try {
        ws.close(1001, 'Server shutting down');
      } catch {
        // ignore — socket may already be closing
      }
    }
    await new Promise<void>((resolve, reject) => {
      if (!this.wss) {
        resolve();
        return;
      }
      this.wss.close((err) => (err ? reject(err) : resolve()));
    });
  }

  // ---- HTTP upgrade gate: path + roomCode must be valid BEFORE a WS connection is even established --

  private verifyClient = (
    info: { origin: string; secure: boolean; req: IncomingMessage },
    callback: (result: boolean, code?: number, message?: string) => void,
  ): void => {
    const url = info.req.url ?? '';
    const match = /^\/(host|play)\/([^/?]+)/.exec(url);
    if (!match) {
      callback(false, 400, 'Invalid connection path');
      return;
    }
    const kind = match[1] as ConnectionKind;
    const roomCode = decodeURIComponent(match[2]!);

    this.deps.roomLookupRepo
      .resolveRoomCode(roomCode)
      .then((roomId) => {
        if (!roomId) {
          callback(false, 404, 'Unknown room code');
          return;
        }
        this.pendingConnectionInfo.set(info.req, { kind, roomCode, roomId });
        callback(true);
      })
      .catch(() => callback(false, 500, 'Internal error'));
  };

  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const info = this.pendingConnectionInfo.get(request);
    this.pendingConnectionInfo.delete(request);
    if (!info) {
      ws.close(1011, 'Internal error');
      return;
    }

    const meta: SocketMeta = {
      kind: info.kind,
      roomId: info.roomId,
      roomCode: info.roomCode,
      authenticated: false,
      privateInfoSent: false,
      malformedCount: 0,
      rateLimiter: new RateLimiter(this.options.rateLimitMaxMessages, this.options.rateLimitWindowMs, this.deps.fsmDeps.now),
      isAlive: true,
      replaced: false,
      authTimer: null,
    };
    meta.authTimer = setTimeout(() => {
      const current = this.sockets.get(ws);
      if (current && !current.authenticated) {
        this.sendError(ws, 'NOT_AUTHENTICATED', 'Authentication timed out');
        ws.close(4001, 'Authentication timeout');
      }
    }, this.options.authTimeoutMs);
    this.sockets.set(ws, meta);

    ws.on('message', (data: RawData, isBinary: boolean) => this.handleMessage(ws, data, isBinary));
    ws.on('close', () => this.handleClose(ws));
    ws.on('error', () => {
      /* 'close' always follows an 'error' for ws sockets — cleanup happens there */
    });
    ws.on('pong', () => {
      const current = this.sockets.get(ws);
      if (current) current.isAlive = true;
    });
  }

  // ---- Inbound message pipeline: size -> rate limit -> JSON -> envelope schema -> routing --------

  private handleMessage(ws: WebSocket, data: RawData, isBinary: boolean): void {
    const meta = this.sockets.get(ws);
    if (!meta) return;

    if (isBinary) {
      this.sendError(ws, 'INVALID_MESSAGE_SCHEMA', 'Binary frames are not supported');
      this.registerViolation(ws, meta);
      return;
    }

    const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    if (Buffer.byteLength(raw, 'utf8') > this.options.maxPayloadBytes) {
      this.sendError(ws, 'PAYLOAD_TOO_LARGE', 'Message exceeds the maximum allowed size');
      this.registerViolation(ws, meta);
      return;
    }

    if (!meta.rateLimiter.tryConsume()) {
      this.sendError(ws, 'RATE_LIMITED', 'Too many messages — slow down');
      this.registerViolation(ws, meta);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(ws, 'MALFORMED_JSON', 'Message is not valid JSON');
      this.registerViolation(ws, meta);
      return;
    }

    const envelope = WireMessageSchema.safeParse(parsed);
    if (!envelope.success) {
      this.sendError(ws, 'INVALID_MESSAGE_SCHEMA', 'Message does not match the expected envelope shape');
      this.registerViolation(ws, meta);
      return;
    }

    void this.routeMessage(ws, meta, envelope.data);
  }

  private registerViolation(ws: WebSocket, meta: SocketMeta): void {
    meta.malformedCount += 1;
    if (meta.malformedCount >= this.options.maxViolations) {
      ws.close(4002, 'Too many invalid or excessive messages');
    }
  }

  private async routeMessage(ws: WebSocket, meta: SocketMeta, message: WireMessage): Promise<void> {
    const { type, requestId, payload } = message;

    if (SYSTEM_ONLY_EVENT_TYPES.has(type)) {
      this.sendError(ws, 'SYSTEM_EVENT_NOT_ALLOWED', `"${type}" is a system-only event and cannot be sent by a client`, requestId);
      return;
    }

    const expectedPrefix = meta.kind === 'host' ? 'host:' : 'player:';
    if (!type.startsWith(expectedPrefix)) {
      this.sendError(ws, 'WRONG_CONNECTION_KIND', `"${type}" is not valid on a ${meta.kind} connection`, requestId);
      return;
    }

    if (GATEWAY_LIFECYCLE_EVENT_TYPES.has(type)) {
      await this.handleLifecycleMessage(ws, meta, type, requestId, payload);
      return;
    }

    if (!meta.authenticated) {
      this.sendError(ws, 'NOT_AUTHENTICATED', 'Authenticate before sending gameplay events', requestId);
      return;
    }

    const schema = FSM_EVENT_PAYLOAD_SCHEMAS[type];
    if (!schema) {
      this.sendError(ws, 'UNSUPPORTED_EVENT_TYPE', `Unknown event type "${type}"`, requestId);
      return;
    }
    const parsedPayload: unknown = schema.safeParse(payload);
    if (!(parsedPayload as { success: boolean }).success) {
      this.sendError(ws, 'INVALID_MESSAGE_SCHEMA', 'Payload does not match the expected shape for this event type', requestId);
      return;
    }

    await this.dispatchFsmEvent(ws, meta, type, requestId, (parsedPayload as { data: Record<string, unknown> }).data);
  }

  // ---- Gateway-only lifecycle messages (never reach the FSM directly) ----------------------------

  private async handleLifecycleMessage(ws: WebSocket, meta: SocketMeta, type: string, requestId: string | null, payload: unknown): Promise<void> {
    switch (type) {
      case 'host:reconnect':
        await this.handleHostReconnect(ws, meta, requestId, payload);
        return;
      case 'player:join':
        await this.handlePlayerJoin(ws, meta, requestId, payload);
        return;
      case 'player:reconnect':
        await this.handlePlayerReconnect(ws, meta, requestId, payload);
        return;
      case 'player:leave':
        await this.handlePlayerLeave(ws, meta, requestId, payload);
        return;
      default:
        this.sendError(ws, 'UNSUPPORTED_EVENT_TYPE', `Unknown event type "${type}"`, requestId);
    }
  }

  private async handleHostReconnect(ws: WebSocket, meta: SocketMeta, requestId: string | null, payload: unknown): Promise<void> {
    if (meta.authenticated) {
      this.sendError(ws, 'ALREADY_AUTHENTICATED', 'This socket is already authenticated', requestId);
      return;
    }
    const parsed = HostReconnectPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_MESSAGE_SCHEMA', 'Invalid host reconnect payload', requestId);
      return;
    }

    const record = await this.deps.sessionRepo.resolveHostSession(parsed.data.hostSessionToken);
    if (!record) {
      this.sendError(ws, 'SESSION_INVALID', 'Unknown or expired host session', requestId);
      return;
    }
    if (record.roomId !== meta.roomId) {
      this.sendError(ws, 'SESSION_ROOM_MISMATCH', 'This session does not belong to this room', requestId);
      return;
    }

    this.markAuthenticated(meta);
    const previous = this.registry.setHost(meta.roomId, ws);
    if (previous && previous !== ws) this.closeReplacedSocket(previous);

    const actor = this.deps.roomActorManager.get(meta.roomId);
    try {
      await actor.dispatch({ type: 'host:reconnected' }, { kind: 'host' });
    } catch (err) {
      this.handleActorError(ws, meta, err, requestId);
      return;
    }

    this.send(ws, { type: 'host:authenticated', requestId, payload: { roomId: meta.roomId } });
    await this.broadcastRoom(meta.roomId);
  }

  private async handlePlayerJoin(ws: WebSocket, meta: SocketMeta, requestId: string | null, payload: unknown): Promise<void> {
    if (meta.authenticated) {
      this.sendError(ws, 'ALREADY_AUTHENTICATED', 'This socket is already authenticated', requestId);
      return;
    }
    const parsed = PlayerJoinPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_MESSAGE_SCHEMA', 'Invalid join payload', requestId);
      return;
    }

    const actor = this.deps.roomActorManager.get(meta.roomId);
    let outcome;
    try {
      outcome = await actor.runLifecycle((room, priv, fsmDeps) => {
        const result = joinPlayer(room, priv, parsed.data, fsmDeps);
        return {
          room: result.room,
          priv: result.priv,
          value: { playerId: result.playerId, sessionToken: result.sessionToken },
          rejected: result.rejected,
        };
      });
    } catch (err) {
      this.handleActorError(ws, meta, err, requestId);
      return;
    }

    if (outcome.rejected) {
      this.sendError(ws, outcome.rejected.code, outcome.rejected.message ?? 'Unable to join this room', requestId);
      return;
    }

    const { playerId, sessionToken } = outcome.value;
    await this.deps.sessionRepo.setPlayerSession(sessionToken!, { roomId: meta.roomId, playerId: playerId! }, this.options.ttlSeconds);

    this.markAuthenticated(meta);
    meta.playerId = playerId!;
    meta.sessionToken = sessionToken!;
    const previous = this.registry.setPlayer(meta.roomId, playerId!, ws);
    if (previous && previous !== ws) this.closeReplacedSocket(previous);

    // The ONLY place sessionToken is ever transmitted — never included in any later view/broadcast.
    this.send(ws, { type: 'player:joined', requestId, payload: { playerId, sessionToken } });
    await this.broadcastRoom(meta.roomId);
  }

  private async handlePlayerReconnect(ws: WebSocket, meta: SocketMeta, requestId: string | null, payload: unknown): Promise<void> {
    if (meta.authenticated) {
      this.sendError(ws, 'ALREADY_AUTHENTICATED', 'This socket is already authenticated', requestId);
      return;
    }
    const parsed = PlayerReconnectPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_MESSAGE_SCHEMA', 'Invalid reconnect payload', requestId);
      return;
    }

    const record = await this.deps.sessionRepo.resolvePlayerSession(parsed.data.sessionToken);
    if (!record) {
      this.sendError(ws, 'SESSION_INVALID', 'Unknown or expired session', requestId);
      return;
    }
    if (record.roomId !== meta.roomId) {
      this.sendError(ws, 'SESSION_ROOM_MISMATCH', 'This session does not belong to this room', requestId);
      return;
    }

    this.markAuthenticated(meta);
    meta.playerId = record.playerId;
    meta.sessionToken = parsed.data.sessionToken;
    const previous = this.registry.setPlayer(meta.roomId, record.playerId, ws);
    if (previous && previous !== ws) this.closeReplacedSocket(previous);

    const actor = this.deps.roomActorManager.get(meta.roomId);
    try {
      await actor.dispatch({ type: 'player:reconnected', playerId: record.playerId }, { kind: 'player', playerId: record.playerId });
    } catch (err) {
      this.handleActorError(ws, meta, err, requestId);
      return;
    }

    this.send(ws, { type: 'player:reconnected', requestId, payload: { playerId: record.playerId } });
    await this.broadcastRoom(meta.roomId);
  }

  private async handlePlayerLeave(ws: WebSocket, meta: SocketMeta, requestId: string | null, payload: unknown): Promise<void> {
    if (!meta.authenticated || !meta.playerId) {
      this.sendError(ws, 'NOT_AUTHENTICATED', 'Not joined to this room', requestId);
      return;
    }
    const parsed = PlayerLeavePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.sendError(ws, 'INVALID_MESSAGE_SCHEMA', 'Invalid leave payload', requestId);
      return;
    }

    const actor = this.deps.roomActorManager.get(meta.roomId);
    const playerId = meta.playerId;
    let outcome;
    try {
      outcome = await actor.runLifecycle((room, priv, fsmDeps) => {
        const result = leavePlayer(room, priv, playerId, fsmDeps);
        return { room: result.room, priv: result.priv, value: undefined, rejected: result.rejected };
      });
    } catch (err) {
      this.handleActorError(ws, meta, err, requestId);
      return;
    }

    if (outcome.rejected) {
      this.sendError(ws, outcome.rejected.code, outcome.rejected.message ?? 'Unable to leave', requestId);
      return;
    }

    if (meta.sessionToken) {
      await this.deps.sessionRepo.deletePlayerSession(meta.sessionToken);
    }
    this.registry.removePlayer(meta.roomId, playerId, ws);
    this.send(ws, { type: 'player:left', requestId, payload: {} });
    ws.close(1000, 'Left room');
    await this.broadcastRoom(meta.roomId);
  }

  // ---- FSM event dispatch --------------------------------------------------------------------

  private async dispatchFsmEvent(ws: WebSocket, meta: SocketMeta, type: string, requestId: string | null, payload: Record<string, unknown>): Promise<void> {
    const sender: EventSender = meta.kind === 'host' ? { kind: 'host' } : { kind: 'player', playerId: meta.playerId! };
    // Identity (playerId) is always injected from the authenticated socket, never read from the
    // wire payload — the payload schemas above never even declare a playerId field, so there is
    // structurally nothing for a client to spoof (ARCHITECTURE.md §1.1).
    const event = (meta.kind === 'player' ? { type, ...payload, playerId: meta.playerId! } : { type, ...payload }) as InboundEvent;

    const actor = this.deps.roomActorManager.get(meta.roomId);
    let result;
    try {
      result = await actor.dispatch(event, sender);
    } catch (err) {
      this.handleActorError(ws, meta, err, requestId);
      return;
    }

    if (result.rejected) {
      this.sendError(ws, result.rejected.code, result.rejected.message ?? 'Event rejected', requestId);
      return;
    }

    await this.broadcastRoom(meta.roomId);
  }

  // ---- View broadcasting ----------------------------------------------------------------------

  private async broadcastRoom(roomId: string): Promise<void> {
    const actor = this.deps.roomActorManager.get(roomId);
    let snapshot;
    try {
      snapshot = actor.getSnapshot() ?? (await actor.getOrLoadSnapshot());
    } catch {
      return; // room vanished between the mutation and the broadcast — nothing sane to send
    }

    const hostWs = this.registry.getHost(roomId);
    if (hostWs) {
      try {
        this.send(hostWs, { type: 'view:tv', requestId: null, payload: buildTvView(snapshot.room) });
      } catch {
        this.logger({ roomId, event: 'view_build_failed', detail: { recipient: 'host' } });
      }
    }

    for (const [playerId, ws] of this.registry.getAllPlayerSockets(roomId)) {
      try {
        const view = buildPlayerView(snapshot.room, snapshot.priv, playerId);
        this.send(ws, { type: 'view:player', requestId: null, payload: view });

        const meta = this.sockets.get(ws);
        if (meta && !meta.privateInfoSent) {
          const privateView = buildPrivatePlayerView(snapshot.priv, playerId);
          if (privateView) {
            this.send(ws, { type: 'player:privateRoleInfo', requestId: null, payload: privateView });
            meta.privateInfoSent = true;
          }
        }
      } catch {
        this.logger({ roomId, event: 'view_build_failed', detail: { recipient: 'player', playerId } });
      }
    }
  }

  // ---- Disconnect / replacement handling ------------------------------------------------------

  private handleClose(ws: WebSocket): void {
    const meta = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (!meta) return;
    if (meta.authTimer) clearTimeout(meta.authTimer);

    // Superseded by a newer connection for the same session — not a genuine disconnect, and the
    // registry slot already belongs to the new socket, so there is nothing further to clean up.
    if (meta.replaced) return;

    if (meta.kind === 'host') {
      this.registry.removeHost(meta.roomId, ws);
      if (meta.authenticated) {
        void this.dispatchSystemEvent(meta.roomId, { type: 'host:disconnected' }, { kind: 'host' });
      }
      return;
    }

    if (meta.playerId) {
      this.registry.removePlayer(meta.roomId, meta.playerId, ws);
      if (meta.authenticated) {
        void this.dispatchSystemEvent(meta.roomId, { type: 'player:disconnected', playerId: meta.playerId }, { kind: 'player', playerId: meta.playerId });
      }
    }
  }

  private async dispatchSystemEvent(roomId: string, event: InboundEvent, sender: EventSender): Promise<void> {
    try {
      const actor = this.deps.roomActorManager.get(roomId);
      const result = await actor.dispatch(event, sender);
      if (!result.rejected) {
        await this.broadcastRoom(roomId);
      }
    } catch {
      this.logger({ roomId, event: 'system_event_dispatch_failed' });
    }
  }

  private closeReplacedSocket(ws: WebSocket): void {
    const meta = this.sockets.get(ws);
    if (meta) meta.replaced = true;
    this.send(ws, {
      type: 'error:actionRejected',
      requestId: null,
      payload: { code: 'SESSION_INVALID', message: 'This session was taken over by a newer connection' } satisfies { code: GatewayErrorCode; message: string },
    });
    try {
      ws.close(4000, 'Replaced by newer connection');
    } catch {
      // ignore
    }
  }

  private markAuthenticated(meta: SocketMeta): void {
    if (meta.authTimer) {
      clearTimeout(meta.authTimer);
      meta.authTimer = null;
    }
    meta.authenticated = true;
    meta.privateInfoSent = false;
  }

  private handleActorError(ws: WebSocket, meta: SocketMeta, err: unknown, requestId: string | null): void {
    if (err instanceof RoomConsistencyError && err.code === 'ROOM_NOT_FOUND') {
      this.sendError(ws, 'ROOM_UNAVAILABLE', 'This room no longer exists', requestId);
      this.evictRoomConnections(meta.roomId, 'This room no longer exists');
      return;
    }
    this.logger({ roomId: meta.roomId, event: 'actor_error' });
    this.sendError(ws, 'INTERNAL_ERROR', 'Something went wrong processing your request', requestId);
  }

  private evictRoomConnections(roomId: string, reason: string): void {
    const hostWs = this.registry.getHost(roomId);
    if (hostWs) {
      this.send(hostWs, { type: 'error:actionRejected', requestId: null, payload: { code: 'ROOM_UNAVAILABLE', message: reason } });
      hostWs.close(4003, reason);
    }
    for (const [, ws] of this.registry.getAllPlayerSockets(roomId)) {
      this.send(ws, { type: 'error:actionRejected', requestId: null, payload: { code: 'ROOM_UNAVAILABLE', message: reason } });
      ws.close(4003, reason);
    }
  }

  // ---- Heartbeat -------------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [ws, meta] of this.sockets) {
        if (!meta.isAlive) {
          ws.terminate();
          continue;
        }
        meta.isAlive = false;
        try {
          ws.ping();
        } catch {
          // ignore — 'close' will fire if the socket is actually dead
        }
      }
    }, this.options.heartbeatIntervalMs);
  }

  // ---- Outbound send helpers -------------------------------------------------------------------

  private send(ws: WebSocket, message: WireMessage): void {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify(message));
    } catch {
      this.logger({ roomId: this.sockets.get(ws)?.roomId ?? 'unknown', event: 'send_failed' });
    }
  }

  private sendError(ws: WebSocket, code: GatewayErrorCode, message: string, requestId: string | null = null): void {
    this.send(ws, { type: 'error:actionRejected', requestId, payload: { code, message } satisfies { code: GatewayErrorCode; message: string } });
  }
}
