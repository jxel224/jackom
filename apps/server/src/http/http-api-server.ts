import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ApiErrorCode,
  ApiErrorPayload,
  CreateRoomResponseBody,
  JoinRoomResponseBody,
  RoomAvailabilityResponseBody,
} from '../shared.js';
import type { Deps } from '../types/deps.js';
import type { RoomActorManager } from '../actors/room-actor-manager.js';
import type { RoomLookupRepository } from '../persistence/room-lookup-repo.js';
import type { SessionRepository } from '../persistence/session-repo.js';
import { RoomConsistencyError } from '../persistence/errors.js';
import { noopRoomLogger, type RoomLogger } from '../persistence/logging.js';
import { DEFAULT_ROOM_TTL_SECONDS } from '../persistence/config.js';
import { createDefaultConfig } from '../config/defaults.js';
import { joinPlayer } from '../fsm/room-lifecycle.js';
import { getPlayerCount } from '../selectors/players.js';
import { buildTvView } from '../views/build-tv-view.js';
import { buildPlayerView } from '../views/build-player-view.js';
import { RateLimiter } from '../gateway/rate-limiter.js';
import { ApiError, ApiErrors } from './errors.js';
import { IdempotencyCache } from './idempotency-cache.js';
import { CreateRoomRequestSchema, JoinRoomRequestSchema, RoomCodeParamSchema } from './schemas.js';

/**
 * Development Step 7A's HTTP boundary — a small, dependency-free (no Express/Fastify) wrapper
 * around Node's built-in `http` module, deliberately matching `gateway/gateway-server.ts`'s shape
 * (constructor(deps, options) + listen()/close()). This is the ONLY place HTTP-specific concerns
 * (CORS, request size, rate limiting, JSON parsing) live — every route handler below immediately
 * delegates the actual mutation to `RoomActorManager`/`RoomActor.runLifecycle()`, the SAME
 * authoritative path the WebSocket gateway uses. No handler here ever calls an FSM transition
 * function or touches Redis/RoomState directly.
 */

// No avatar-selection UI exists yet (out of scope for Step 7A) — every HTTP-created player gets
// this fixed placeholder avatarId until a real avatar-picker step wires a real value through.
const DEFAULT_AVATAR_ID = 'default';

export interface HttpApiDeps {
  roomActorManager: RoomActorManager;
  roomLookupRepo: RoomLookupRepository;
  sessionRepo: SessionRepository;
  fsmDeps: Deps;
}

export interface HttpApiOptions {
  /** Request body size limit, in bytes. */
  maxBodyBytes?: number;
  /**
   * Exact origins allowed to call this API from a browser. Empty (the default) means every
   * cross-origin request is rejected — there is no wildcard/`*` fallback, and credentials are never
   * part of this scheme (sessions travel in response/request BODIES, never cookies — see
   * IMPLEMENTATION_PROGRESS.md Step 7A for why).
   */
  allowedOrigins?: string[];
  rateLimitMaxRequests?: number;
  rateLimitWindowMs?: number;
  ttlSeconds?: number;
  /** How long a `requestId` idempotency key is remembered for. */
  idempotencyTtlMs?: number;
  logger?: RoomLogger;
}

interface ResolvedOptions {
  maxBodyBytes: number;
  allowedOrigins: string[];
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  ttlSeconds: number;
  idempotencyTtlMs: number;
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  maxBodyBytes: 16 * 1024,
  allowedOrigins: [],
  rateLimitMaxRequests: 10,
  rateLimitWindowMs: 60_000,
  ttlSeconds: DEFAULT_ROOM_TTL_SECONDS,
  idempotencyTtlMs: 5 * 60_000,
};

/** Crude bound on unbounded per-IP rate-limiter growth — a basic, single-instance safeguard, not a real eviction policy. */
const MAX_TRACKED_IPS = 10_000;

interface CachedJoinResult {
  displayName: string;
  body: JoinRoomResponseBody;
}

export class HttpApiServer {
  private readonly options: ResolvedOptions;
  private readonly logger: RoomLogger;
  private readonly idempotency: IdempotencyCache<CachedJoinResult>;
  private readonly rateLimiters = new Map<string, RateLimiter>();
  private server: http.Server | null = null;

  constructor(
    private readonly deps: HttpApiDeps,
    options: HttpApiOptions = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = options.logger ?? noopRoomLogger;
    this.idempotency = new IdempotencyCache(this.options.idempotencyTtlMs, deps.fsmDeps.now);
  }

  listen(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });
      this.server = server;
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        const boundPort = typeof address === 'object' && address !== null ? address.port : port;
        resolve(boundPort);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  // ---- Routing -----------------------------------------------------------------------------

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const origin = req.headers.origin;
      if (origin && !this.options.allowedOrigins.includes(origin)) {
        this.sendError(res, 403, 'INVALID_REQUEST', 'الأصل غير مسموح به.');
        return;
      }
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url ?? '/', 'http://internal');
      const segments = url.pathname.split('/').filter(Boolean);

      if (segments[0] === 'api' && segments[1] === 'rooms') {
        if (segments.length === 2 && req.method === 'POST') {
          await this.handleCreateRoom(req, res);
          return;
        }
        if (segments.length === 3 && req.method === 'GET') {
          await this.handleGetRoomAvailability(req, res, segments[2]!);
          return;
        }
        if (segments.length === 4 && segments[3] === 'players' && req.method === 'POST') {
          await this.handleJoinRoom(req, res, segments[2]!);
          return;
        }
      }

      this.sendError(res, 404, 'INVALID_REQUEST', 'المسار غير موجود.');
    } catch (err) {
      this.handleError(res, err);
    }
  }

  // ---- Route handlers ------------------------------------------------------------------------

  private async handleCreateRoom(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.checkRateLimit(this.clientIp(req));
    const rawBody = await this.readJsonBody(req);
    // Accepted but intentionally unused beyond shape validation — Step 7A never lets a client
    // choose RoomConfig; every room uses createDefaultConfig().
    CreateRoomRequestSchema.parse(rawBody);

    const config = createDefaultConfig();
    const handle = await this.deps.roomActorManager.createRoom(config);
    const snapshot = this.deps.roomActorManager.get(handle.roomId).getSnapshot();
    if (!snapshot) {
      // Structurally unreachable: createRoom() always registers a pre-hydrated actor. Guarded
      // anyway rather than asserting with `!`, so a future refactor fails loudly, not silently.
      throw ApiErrors.internal();
    }

    const body: CreateRoomResponseBody = {
      roomCode: handle.roomCode,
      hostSessionToken: handle.hostSessionToken,
      tv: buildTvView(snapshot.room),
    };
    this.sendJson(res, 201, body);
  }

  private async handleGetRoomAvailability(req: IncomingMessage, res: ServerResponse, rawRoomCode: string): Promise<void> {
    const roomCode = this.parseRoomCodeParam(rawRoomCode);

    const roomId = await this.deps.roomLookupRepo.resolveRoomCode(roomCode);
    if (!roomId) throw ApiErrors.roomNotFound();

    const room = await this.loadRoom(roomId);
    const playerCount = getPlayerCount(room);
    const minPlayers = room.config.rules.minPlayers;
    const maxPlayers = room.config.rules.maxPlayers;
    const matchStarted = room.phase.state !== 'LOBBY' && room.phase.state !== 'REMATCH_LOBBY';
    const full = playerCount >= maxPlayers;

    const body: RoomAvailabilityResponseBody = {
      roomCode,
      joinable: !matchStarted && !full,
      full,
      matchStarted,
      playerCount,
      minPlayers,
      maxPlayers,
    };
    this.sendJson(res, 200, body);
  }

  private async handleJoinRoom(req: IncomingMessage, res: ServerResponse, rawRoomCode: string): Promise<void> {
    this.checkRateLimit(this.clientIp(req));
    const roomCode = this.parseRoomCodeParam(rawRoomCode);

    const rawBody = await this.readJsonBody(req);
    const parsedBody = JoinRoomRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) throw ApiErrors.invalidDisplayName();
    const { displayName, requestId } = parsedBody.data;

    const roomId = await this.deps.roomLookupRepo.resolveRoomCode(roomCode);
    if (!roomId) throw ApiErrors.roomNotFound();

    const cacheKey = requestId ? `${roomId}:${requestId}` : null;
    if (cacheKey) {
      const cached = this.idempotency.get(cacheKey);
      if (cached) {
        if (cached.displayName !== displayName) throw ApiErrors.duplicatePlayer();
        this.sendJson(res, 200, cached.body);
        return;
      }
    }

    const actor = this.deps.roomActorManager.get(roomId);
    let outcome;
    try {
      outcome = await actor.runLifecycle((room, priv, fsmDeps) => {
        const result = joinPlayer(room, priv, { name: displayName, avatarId: DEFAULT_AVATAR_ID }, fsmDeps);
        return { room: result.room, priv: result.priv, value: { playerId: result.playerId, sessionToken: result.sessionToken }, rejected: result.rejected };
      });
    } catch (err) {
      if (err instanceof RoomConsistencyError && err.code === 'ROOM_NOT_FOUND') throw ApiErrors.roomNotFound();
      throw err;
    }

    if (outcome.rejected) {
      if (outcome.rejected.code === 'INVALID_PLAYER_COUNT') throw ApiErrors.roomFull();
      if (outcome.rejected.code === 'MATCH_IN_PROGRESS') throw ApiErrors.roomNotJoinable();
      throw ApiErrors.internal();
    }

    const { playerId, sessionToken } = outcome.value;
    await this.deps.sessionRepo.setPlayerSession(sessionToken!, { roomId, playerId: playerId! }, this.options.ttlSeconds);

    const body: JoinRoomResponseBody = {
      roomCode,
      playerId: playerId!,
      playerSessionToken: sessionToken!,
      view: buildPlayerView(outcome.room, outcome.priv, playerId!),
    };

    if (cacheKey) this.idempotency.set(cacheKey, { displayName, body });

    this.sendJson(res, 201, body);
  }

  // ---- Shared helpers ------------------------------------------------------------------------

  private parseRoomCodeParam(raw: string): string {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      throw ApiErrors.invalidRoomCode();
    }
    const parsed = RoomCodeParamSchema.safeParse(decoded);
    if (!parsed.success) throw ApiErrors.invalidRoomCode();
    return parsed.data;
  }

  private async loadRoom(roomId: string) {
    try {
      const snapshot = await this.deps.roomActorManager.get(roomId).getOrLoadSnapshot();
      return snapshot.room;
    } catch (err) {
      if (err instanceof RoomConsistencyError) throw ApiErrors.roomNotFound();
      throw err;
    }
  }

  private checkRateLimit(ip: string): void {
    if (this.rateLimiters.size >= MAX_TRACKED_IPS) {
      this.rateLimiters.clear();
    }
    let limiter = this.rateLimiters.get(ip);
    if (!limiter) {
      limiter = new RateLimiter(this.options.rateLimitMaxRequests, this.options.rateLimitWindowMs, this.deps.fsmDeps.now);
      this.rateLimiters.set(ip, limiter);
    }
    if (!limiter.tryConsume()) throw ApiErrors.rateLimited();
  }

  private clientIp(req: IncomingMessage): string {
    return req.socket.remoteAddress ?? 'unknown';
  }

  private readJsonBody(req: IncomingMessage): Promise<unknown> {
    const maxBytes = this.options.maxBodyBytes;
    return new Promise((resolve, reject) => {
      let settled = false;
      const settleResolve = (value: unknown) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      const settleReject = (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      const chunks: Buffer[] = [];
      let total = 0;
      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          settleReject(new ApiError(413, 'INVALID_REQUEST', 'الطلب كبير جدًا.'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw.trim().length === 0) {
          settleResolve({});
          return;
        }
        try {
          settleResolve(JSON.parse(raw));
        } catch {
          settleReject(ApiErrors.invalidRequest('نص الطلب ليس JSON صالحًا.'));
        }
      });
      req.on('error', (err) => settleReject(err));
    });
  }

  private handleError(res: ServerResponse, err: unknown): void {
    if (err instanceof ApiError) {
      this.sendError(res, err.status, err.code, err.message);
      return;
    }
    this.logger({ roomId: 'unknown', event: 'http_internal_error' });
    this.sendError(res, 500, 'INTERNAL_ERROR', 'حدث خطأ في الخادم. حاول مرة أخرى.');
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  }

  private sendError(res: ServerResponse, status: number, code: ApiErrorCode, message: string): void {
    this.sendJson(res, status, { code, message } satisfies ApiErrorPayload);
  }
}
